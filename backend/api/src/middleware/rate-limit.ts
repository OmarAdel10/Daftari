/**
 * Rate limit middleware factory for Hono.
 *
 * This middleware runs AFTER requireAuth() but BEFORE body parsing,
 * so rate limiting happens before body parsing. It counts "work units"
 * (e.g., number of sales items) rather than just request count.
 *
 * Usage:
 *   app.post('/sales/sync',
 *     requireAuth(...),
 *     createRateLimitMiddleware({
 *       ipRateLimiter,
 *       maxBodySize: 1024 * 1024, // 1 MB
 *       maxItems: 100,
 *       itemPath: 'sales',
 *       keyBuilder: (c) => ({ tenantId: c.get('authUid'), ip: c.req.header('CF-Connecting-IP') }),
 *     }),
 *     async (c) => { ... }
 *   )
 */

import type { Context, Next } from 'hono';
import type { IpRateLimiter } from '../application/services/ip-rate-limiter';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { createIpRateLimiter, createGlobalIpRateLimiter } from '../application/services/ip-rate-limiter';

export interface RateLimitMiddlewareOptions {
  /** Rate limiter instance (in-memory or global DO). */
  ipRateLimiter: IpRateLimiter;
  /** Maximum request body size in bytes. Default: 1 MB. */
  maxBodySize?: number;
  /** Maximum number of items in the array (e.g., sales items). Default: 100. */
  maxItems?: number;
  /** JSON path to the items array (e.g., 'sales' for { sales: [...] }). */
  itemPath?: string;
  /** Custom error message for body size limit. */
  bodySizeError?: string;
  /** Custom error message for max items limit. */
  maxItemsError?: string;
}

/**
 * Creates a rate limit middleware that runs after auth but before body parsing.
 * The middleware reads the raw body, checks size and item count, then
 * re-attaches the parsed body to the context.
 */
export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const {
    ipRateLimiter,
    maxBodySize = 1024 * 1024, // 1 MB default
    maxItems = 100,
    itemPath = 'sales',
    bodySizeError = 'REQUEST_BODY_TOO_LARGE',
    maxItemsError = 'TOO_MANY_ITEMS',
  } = options;

  return async (c: Context, next: Next) => {
    // Get tenant ID and client IP from context (set by requireAuth middleware)
    const tenantId = c.get('authUid');
    const ip = c.req.header('CF-Connecting-IP')?.trim() ?? 'unknown';

    if (!tenantId) {
      return c.json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    // Check rate limit before processing body
    const decision = await ipRateLimiter(tenantId, ip, Date.now());
    if (!decision.allowed) {
      return c.json(
        { ok: false, error: 'RATE_LIMITED', retry_after_ms: decision.retryAfterMs ?? 0 },
        429,
      );
    }

    // Read raw body for size check
    const rawBody = await c.req.text();

    // Check body size
    if (rawBody.length > maxBodySize) {
      return c.json({ ok: false, error: bodySizeError }, 413);
    }

    // Parse JSON and validate item count
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return c.json({ ok: false, error: 'INVALID_JSON' }, 400);
    }

    // Check item count if the path exists
    if (itemPath && parsedBody && typeof parsedBody === 'object') {
      const bodyObj = parsedBody as Record<string, unknown>;
      const items = bodyObj[itemPath];
      if (Array.isArray(items) && items.length > maxItems) {
        return c.json({ ok: false, error: maxItemsError }, 413);
      }
    }

    // Re-attach parsed body to context for downstream handlers
    // We use a custom property to store the pre-parsed body
    (c as any)._parsedBody = parsedBody;

    // Override c.req.json() to return our pre-parsed body
    const originalJson = c.req.json.bind(c.req);
    c.req.json = async () => (c as any)._parsedBody ?? originalJson();

    await next();
  };
}

/**
 * Creates the in-memory or global IP rate limiter for use with middleware.
 */
export function createRateLimiter(
  options: {
    windowMs: number;
    maxPerWindow: number;
    softCap?: number;
    maxEntries: number;
  },
  doNamespace?: DurableObjectNamespace,
) {
  return doNamespace
    ? createGlobalIpRateLimiter(options, doNamespace)
    : createIpRateLimiter(options);
}