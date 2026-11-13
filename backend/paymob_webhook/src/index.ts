/**
 * Paymob Webhook Handler for Daftari POS
 * Cloudflare Worker — TypeScript
 *
 * Verifies the HMAC (SHA-512 over the 20 documented fields, compared with
 * the `hmac` URL query param per Paymob docs), issues real Ed25519 licenses
 * (self-contained keys), and upserts them into Turso.
 *
 * Presentation layer only: parses HTTP requests, builds DTOs, delegates to
 * application use cases, and formats responses. All business logic lives in
 * `src/application/use-cases/`; infrastructure adapters live in
 * `src/infrastructure/`.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildPaymobHmacString } from '../../shared/src/paymob';
import { createTurso, type TursoDb } from '../../shared/src/turso';
import type { LicensePayload } from '../../shared/src/types';
import { signLicenseKey as staticSignLicenseKey } from '../../shared/src/license';
import { HmacValidationServiceImpl } from './domain/services/hmac-validation-service.impl';
import { LicenseSigningServiceImpl } from './domain/services/license-signing-service.impl';
import { InMemoryWebhookEventRepository } from './infrastructure/repositories/in-memory-webhook-event-repository';
import { ProcessWebhookUseCase } from './application/use-cases/process-webhook-use-case';
import { IssueLicenseUseCase } from './application/use-cases/issue-license-use-case';
import { RateLimiter } from './infrastructure/services/rate-limiter';
import type { WebhookEventRepository } from './domain/repositories/webhook-event-repository';
import type { HmacValidationService } from './domain/services/hmac-validation-service';
import type { LicenseSigningService } from './domain/services/license-signing-service';
import type { PostHogAnalyticsService } from './infrastructure/external-services/posthog-analytics-service';

/**
 * In-memory store for order.id → expected merchant_order_id mapping.
 *
 * Populated when a payment intent is created server-side (via
 * registerExpectedMerchantOrderId). Used to detect tampering of
 * merchant_order_id in webhooks — merchant_order_id is NOT in Paymob's
 * 20 HMAC fields (only order.id is), so a MITM attacker between Paymob
 * and this worker could alter merchant_order_id without invalidating
 * the HMAC, causing a license to be issued to the wrong tenant/device.
 *
 * Known limitation: in-memory store is per-Worker-instance. Cross-instance
 * enforcement requires server-side payment intent storage (Phase 5/6).
 */
const expectedMerchantOrderIds = new Map<string, string>();

/**
 * Registers the expected merchant_order_id for a Paymob order.id.
 * Call this when creating a payment intent server-side so the webhook
 * can verify merchant_order_id hasn't been tampered with.
 */
export function registerExpectedMerchantOrderId(orderId: string, merchantOrderId: string): void {
  expectedMerchantOrderIds.set(orderId, merchantOrderId);
}

export interface Env {
  PAYMOB_HMAC_SECRET: string;
  /** Ed25519 private key for license signing — ISOLATED to paymob_webhook
   *  worker. MUST NOT be exposed to the api worker or any other worker.
   *  When consolidating workers (Branch B), keep license signing isolated:
   *  either keep paymob as a separate worker, or scope Ed25519 signing to a
   *  dedicated sub-request with limited secret visibility.
   *  See Plane DAFTARI-181.
   */
  ED25519_PRIVATE_KEY: string;
  ED25519_PUBLIC_KEY: string;
  FIREBASE_PROJECT_ID: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  POSTHOG_API_KEY: string;
}

export interface PaymobDeps {
  hmacValidationService: HmacValidationService;
  webhookEventRepo: WebhookEventRepository;
  licenseSigningService: LicenseSigningService;
  signLicenseKey?: (
    payload: LicensePayload,
    privateKeyB64: string,
  ) => Promise<string>;
  db: TursoDb;
  posthog?: PostHogAnalyticsService;
  /** IP rate limiter for /webhook (default: 30 req/min/IP). Injected for testing. */
  rateLimiter?: RateLimiter;
}

export function parseMerchantOrderId(merchantOrderId: string | null | undefined): {
  tenant_id: string;
  device_hwid: string;
  billing_cycle: 'monthly' | 'yearly' | 'lifetime';
} | null {
  if (!merchantOrderId) return null;
  const parts = merchantOrderId.split('|');
  const tenantId = parts[0] ?? '';
  const deviceHwid = parts[1] ?? '';
  if (tenantId.length === 0 || deviceHwid.length === 0) return null;
  const cycle = (parts[2] ?? 'monthly') as LicensePayload['billingCycle'];
  const cycleValid = cycle === 'monthly' || cycle === 'yearly' || cycle === 'lifetime';
  if (!cycleValid) return null;
  return {
    tenant_id: tenantId,
    device_hwid: deviceHwid,
    billing_cycle: cycle,
  };
}

function subscriptionMs(cycle: LicensePayload['billingCycle']): number {
  switch (cycle) {
    case 'monthly': return 30 * 24 * 60 * 60 * 1000;
    case 'yearly': return 365 * 24 * 60 * 60 * 1000;
    case 'lifetime': return 0;
  }
}

/**
 * Build a paymob webhook app from injected dependencies.
 *
 * Routes delegate to application use cases; the route layer only parses
 * HTTP, builds DTOs, and formats responses. All business logic lives in
 * use cases; infrastructure adapters (Turso repo, PostHog client) are
 * injected here.
 */
export function createPaymobApp(deps: Partial<PaymobDeps> = {}) {
  const hmacValidationService =
    deps.hmacValidationService ?? new HmacValidationServiceImpl();
  const webhookEventRepo =
    deps.webhookEventRepo ?? new InMemoryWebhookEventRepository();
  const licenseSigningService =
    deps.licenseSigningService ?? new LicenseSigningServiceImpl();
  const signLicenseKey =
    deps.signLicenseKey ?? staticSignLicenseKey;
  const db = deps.db;
  if (!db) {
    throw new Error('db is required');
  }
  const posthog = deps.posthog;
  const rateLimiter = deps.rateLimiter ?? new RateLimiter(30, 60_000);

  const processWebhookUseCase = new ProcessWebhookUseCase(
    hmacValidationService,
    webhookEventRepo,
    licenseSigningService,
  );
  const issueLicenseUseCase = new IssueLicenseUseCase(signLicenseKey);

  const app = new Hono<{ Bindings: Env }>();

  app.use('*', cors());

  app.post('/webhook', async (c) => {
    // Pre-auth rate limit: keyed by CF-Connecting-IP (Cloudflare-trusted).
    // Rejects before any body parsing or HMAC computation to protect CPU
    // quota and daily request budget from webhook floods.
    const clientIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const rateResult = rateLimiter.check(`webhook:${clientIp}`);
    if (!rateResult.allowed) {
      return c.json({ error: 'RATE_LIMITED', retryAfterMs: rateResult.retryAfterMs }, 429);
    }

    const env = c.env;
    // Fail closed. No secrets configured → cannot validate HMAC or sign licenses.
    if (
      !env.PAYMOB_HMAC_SECRET ||
      env.PAYMOB_HMAC_SECRET.length === 0 ||
      !env.ED25519_PRIVATE_KEY ||
      env.ED25519_PRIVATE_KEY.length === 0 ||
      !env.POSTHOG_API_KEY ||
      env.POSTHOG_API_KEY.length === 0
    ) {
      return c.json({ error: 'Worker misconfigured' }, 401);
    }

    const payload = await c.req.text();
    const signature = c.req.query('hmac') ?? '';

    let webhook: { obj?: Record<string, unknown> };
    try {
      webhook = JSON.parse(payload) as { obj?: Record<string, unknown> };
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }
    const obj = webhook.obj;
    if (!obj) return c.json({ error: 'Missing obj' }, 400);

    // Verify HMAC-SHA512 over the 20 documented fields.
    const concatenated = buildPaymobHmacString(obj);
    const hmacValid = await hmacValidationService.isValid(
      concatenated,
      signature,
      env.PAYMOB_HMAC_SECRET,
    );
    if (!hmacValid) {
      return c.json({ error: 'INVALID_HMAC' }, 401);
    }

    // merchant_order_id is NOT in Paymob's HMAC fields (only order.id is).
    // If we have an expected mapping for this order.id, verify it matches
    // to detect tampering (see registerExpectedMerchantOrderId).
    const orderRaw = obj['order'];
    let orderIdForCheck: string | null = null;
    if (
      orderRaw &&
      typeof orderRaw === 'object' &&
      !Array.isArray(orderRaw)
    ) {
      const idValue = (orderRaw as Record<string, unknown>).id;
      orderIdForCheck = typeof idValue === 'string' ? idValue : null;
    }
    if (orderIdForCheck && expectedMerchantOrderIds.has(orderIdForCheck)) {
      const expected = expectedMerchantOrderIds.get(orderIdForCheck)!;
      const actualMerchantOrderId =
        typeof (orderRaw as Record<string, unknown>).merchant_order_id === 'string'
          ? (orderRaw as Record<string, unknown>).merchant_order_id
          : null;
      if (actualMerchantOrderId !== expected) {
        return c.json(
          { error: 'MERCHANT_ORDER_ID_MISMATCH' },
          422,
        );
      }
    }
    let parsed;
    if (
      orderRaw &&
      typeof orderRaw === 'object' &&
      !Array.isArray(orderRaw)
    ) {
      const orderId = (orderRaw as Record<string, unknown>).merchant_order_id;
      if (typeof orderId === 'string' || orderId === null) {
        parsed = parseMerchantOrderId(orderId);
      }
    }
    if (!parsed) {
      return c.json({ error: 'merchant_order_id must be tenant|device_hwid|billing_cycle' }, 422);
    }

    const now = Date.now();
    const subMs = subscriptionMs(parsed.billing_cycle);
    const licensePayload: LicensePayload = {
      tenantId: parsed.tenant_id,
      deviceHwid: parsed.device_hwid,
      subscriptionEnd: parsed.billing_cycle === 'lifetime' ? 0 : now + subMs,
      billingCycle: parsed.billing_cycle,
      graceEnd: parsed.billing_cycle === 'lifetime' ? 0 : now + subMs + 5 * 24 * 60 * 60 * 1000,
      createdAt: now,
    };

    const event = {
      transactionId: String(obj['id'] ?? ''),
      success: obj['success'] === true,
      isRefunded: obj['is_refunded'] === true,
      isVoided: obj['is_voided'] === true,
      tenantId: parsed.tenant_id,
      deviceHwid: parsed.device_hwid,
      billingCycle: parsed.billing_cycle,
      receivedAt: now,
    } as import('./domain/entities/webhook-event').WebhookEvent;

    // Delegate HMAC validation, idempotency, entitlement gating, payload
    // computation, and issue decision to the application-layer use case.
    const dto = {
      event,
      concatenated,
      signatureHex: signature,
      hmacSecret: env.PAYMOB_HMAC_SECRET,
    };
    const result = await processWebhookUseCase.execute(dto);
    if (!result.ok) {
      // Map use-case errors to appropriate HTTP status codes.
      const status = result.error === 'INVALID_HMAC' ? 401 : 400;
      return c.json({ error: result.error }, status);
    }

    const { payload: licensePayloadResult, decision } = result.data;

    // Only issue a license when the use case decided to issue.
    if (!decision.issue) {
      return c.json({ status: 'ignored', reason: decision.reason ?? 'not issued' });
    }

    // Sign the license payload with Ed25519.
    const licenseResult = await issueLicenseUseCase.execute({
      payload: licensePayloadResult,
      privateKeyB64: env.ED25519_PRIVATE_KEY,
    });
    if (!licenseResult.ok) {
      return c.json({ error: licenseResult.error }, 500);
    }

    const licenseKey = licenseResult.data.licenseKey;

    // Upsert into Turso (db is required — fail closed if missing).
    await db.upsertLicense({
      ...licensePayloadResult,
      licenseKey,
      status: 'active',
    });

    // Fire-and-forget analytics.
    const transactionId = String(obj['id'] ?? '');
    if (posthog) {
      posthog.capture({
        event: 'payment_success',
        distinct_id: licensePayloadResult.tenantId,
        properties: {
          transaction_id: transactionId,
          tenant_id: licensePayloadResult.tenantId,
          device_hwid: licensePayloadResult.deviceHwid,
          billing_cycle: licensePayloadResult.billingCycle,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      try {
        await fetch('https://us.i.posthog.com/capture/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: env.POSTHOG_API_KEY,
            event: 'payment_success',
            distinct_id: licensePayloadResult.tenantId,
            properties: {
              transaction_id: transactionId,
              tenant_id: licensePayloadResult.tenantId,
              device_hwid: licensePayloadResult.deviceHwid,
              billing_cycle: licensePayloadResult.billingCycle,
            },
            timestamp: new Date().toISOString(),
          }),
        }).then((r) => r.body?.cancel()).catch(() => undefined);
      } catch {
        // Analytics failure must not fail the webhook response.
      }
    }

    return c.json({ status: 'success', license_key: licenseKey });
  });

  return app;
}

export default createPaymobApp;
