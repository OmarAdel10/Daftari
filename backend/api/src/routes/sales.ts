/**
 * Sales routes: sync from cashiers + read for admin dashboard.
 * sale sync also notifies the realtime worker (service binding).
 *
 * All business logic lives in application-layer use cases. Routes handle only
 * HTTP parsing, validation, delegation, and response formatting.
 *
 * Wiring precondition: identity fields (tenantId) must be sourced ONLY from
 * verified middleware context (c.get('authUid')), never from request body
 * or query/header.
 */
import type { Hono } from 'hono';
import type { Env, Vars } from '../env';
import { requireAuth } from '../middleware/auth';
import type { VerifyTokenFn } from '../middleware/auth';
import { notifyRealtime } from '../realtime';
import { SaleRecordUseCase } from '../application/use-cases/sale-record-use-case';
import { SaleListUseCase } from '../application/use-cases/sale-list-use-case';
import type { SaleRecordDto } from '../application/dtos/sale-record.dto';
import type { SaleListDto } from '../application/dtos/sale-list.dto';
import type { Sale } from '../../../shared/src/domain/entities/sale';
import type { SessionRepository } from '../../../shared/src/domain/repositories/session-repository';
import type { AuthUserRepository } from '../../../shared/src/domain/repositories/auth-user-repository';
import type { UserRepository } from '../../../shared/src/domain/repositories/user-repository';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { createIpRateLimiter, createGlobalIpRateLimiter } from '../application/services/ip-rate-limiter';

/** HTTP wire contract: snake_case; shared TypeScript records: camelCase. */
function toWireSale(sale: Sale) {
  return {
    id: sale.id,
    tenant_id: sale.tenantId,
    receipt_json: sale.receiptJson,
    total_piastres: sale.totalPiastres,
    created_at: sale.createdAt,
  };
}

export function registerSales(
  app: Hono<{ Bindings: Env; Variables: Vars }>,
  deps: {
    verifyToken?: VerifyTokenFn;
    sessionRepository: SessionRepository;
    authUserRepository: AuthUserRepository;
    userRepository: UserRepository;
    saleRecord: SaleRecordUseCase;
    saleList: SaleListUseCase;
    /** Optional injectable rate limiter for /sales/sync (login-style T17
     *  signature). When absent the route falls back to a per-IP in-memory
     *  sliding window — a single-isolate budget, so a multi-deploy must
     *  inject a shared limiter for cross-isolate throttling (follow-up). */
    rateLimit?: (tenantId: string, username: string, ip: string, at: number) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
    /** Optional Durable Object namespace for global IP rate limiting.
     *  When provided, createGlobalIpRateLimiter is used so the window
     *  persists across cold starts, isolate recycles, and concurrent isolates. */
    ipRateLimiterDO?: DurableObjectNamespace;
  },
): void {
  const { saleRecord, saleList } = deps;

  app.use('/sales/*', requireAuth({
    verifyToken: deps.verifyToken,
    sessionRepository: deps.sessionRepository,
    authUserRepository: deps.authUserRepository,
    userRepository: deps.userRepository,
  }));

  // Rate limiter for /sales/sync: 30 writes/min/IP.
  // If a Durable Object namespace is provided, use the global limiter so the
  // window persists across cold starts, isolate recycles, and concurrent isolates.
  // Otherwise fall back to the in-memory limiter (tests get isolation for free).
  const ipRateLimit = deps.ipRateLimiterDO
    ? createGlobalIpRateLimiter(
        { windowMs: 60_000, maxPerWindow: 30, softCap: 10_000, maxEntries: 10_000 },
        deps.ipRateLimiterDO,
      )
    : createIpRateLimiter({
        windowMs: 60_000,
        maxPerWindow: 30,
        softCap: 10_000,
        maxEntries: 10_000,
      });

  app.post('/sales/sync', async (c) => {
    const tenantId = c.get('authUid');
    const body = await c.req.json<{
      sales?: Array<{
        id: string;
        receipt_json: string;
        total_piastres: number;
        created_at: number;
      }>;
      device_hwid?: string;
    }>();
    const deviceHwid = body.device_hwid;
    if (!deviceHwid) {
      return c.json({ ok: false, error: 'MISSING_FIELDS' }, 400);
    }

    // Rate-limit per client IP (mirrors /sessions/start, review High #1).
    const callerIp = c.req.header('CF-Connecting-IP')?.trim() ?? 'unknown';
    const decision = deps.rateLimit
      ? await deps.rateLimit(tenantId, deviceHwid, callerIp, Date.now())
      : await ipRateLimit(callerIp, Date.now());
    if (!decision.allowed) {
      return c.json({ ok: false, error: 'RATE_LIMITED', retry_after_ms: decision.retryAfterMs ?? 0 }, 429);
    }

    const sales = body.sales ?? [];
    if (sales.length === 0) {
      return c.json({ ok: true, data: { synced: 0 } });
    }

    for (const sale of sales) {
      const dto: SaleRecordDto = {
        tenantId,
        deviceHwid,
        receiptJson: sale.receipt_json,
        totalPiastres: sale.total_piastres,
        createdAt: sale.created_at,
      };
      const result = await saleRecord.execute(dto);
      if (!result.ok) {
        switch (result.error) {
          case 'MISSING_FIELDS': return c.json({ ok: false, error: 'MISSING_FIELDS' }, 400);
          case 'USER_NOT_FOUND': return c.json({ ok: false, error: 'USER_NOT_FOUND' }, 401);
          case 'NO_LICENSE': return c.json({ ok: false, error: 'NO_LICENSE' }, 401);
          case 'LICENSE_EXPIRED': return c.json({ ok: false, error: 'LICENSE_EXPIRED' }, 401);
          case 'DEVICE_LIMIT_EXCEEDED': return c.json({ ok: false, error: 'DEVICE_LIMIT_EXCEEDED' }, 409);
          case 'RECEIPT_TOO_LARGE': return c.json({ ok: false, error: 'RECEIPT_TOO_LARGE' }, 400);
          case 'SALE_RECORD_FAILED': return c.json({ ok: false, error: 'SALE_RECORD_FAILED' }, 500);
          default: return c.json({ ok: false, error: 'INTERNAL_ERROR' }, 500);
        }
      }
    }

    // Notify the realtime worker (service binding) — fire & forget. Only a
    // count crosses the wire; receipts stay in the database.
    if (c.env.NOTIFIER) {
      const notifyPromise = notifyRealtime(c.env, tenantId, 'sale', { count: sales.length });
      // In Workers, executionCtx.waitUntil extends lifetime. In tests the
      // getter throws, so wrap it.
      try {
        c.executionCtx.waitUntil(notifyPromise);
      } catch {
        await notifyPromise;
      }
    }

    return c.json({ ok: true, data: { synced: sales.length } });
  });

  app.get('/sales', async (c) => {
    const tenantId = c.get('authUid');
    const sinceParam = c.req.query('since');
    const since = sinceParam ? Number(sinceParam) : 0;
    if (sinceParam !== undefined && (!Number.isFinite(since) || since < 0 || since > Number.MAX_SAFE_INTEGER)) {
      return c.json({ ok: false, error: 'INVALID_FIELDS' }, 400);
    }

    const dto: SaleListDto = { tenantId, since };
    const result = await saleList.execute(dto);
    if (!result.ok) {
      return c.json({ ok: false, error: result.error }, 400);
    }

    return c.json({ ok: true, data: { sales: result.data.sales.map(toWireSale) } });
  });
}
