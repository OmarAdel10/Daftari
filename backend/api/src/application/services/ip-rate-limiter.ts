/**
 * Per-IP sliding-window rate limiter factory.
 *
 * Extracted so that multiple HTTP routes can share one implementation
 * instead of each defining an inline copy. Two variants exist:
 * - In-memory (createIpRateLimiter): state bound to the app instance.
 *   Used by tests (each `createApp` call builds its own limiters).
 * - Durable Object (createGlobalIpRateLimiter): state lives in a global DO.
 *   Used by the deployed Worker so the window persists across cold starts,
 *   isolate recycles, and concurrent isolates.
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/** Maximum number of tracked IPs inspected per call while evicting expired
 *  entries. Keeps the per-request CPU cost bounded when the map sits at its
 *  soft cap. */
const MAX_EVICTION_SCAN_PER_CALL = 1000;

export interface IpRateLimiterOptions {
  windowMs: number;
  maxPerWindow: number;
  /** Start evicting fully-expired IPs once the map exceeds this size. */
  softCap?: number;
  /**
   * Hard upper bound on the number of tracked IPs. REQUIRED: a limiter
   * without a bound can grow without limit. When the map exceeds it, the
   * oldest entries are evicted even if they are still inside the window
   * (the limiter fails open under memory pressure rather than growing
   * without bound).
   */
  maxEntries: number;
}

/** Result of a rate-limit check. */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** Sync or async rate limiter function. */
export type IpRateLimiterFn = (
  ip: string,
  now: number,
) => RateLimitResult | Promise<RateLimitResult>;

/** Rate limiter with a size method. */
export interface IpRateLimiter {
  (ip: string, now: number): RateLimitResult | Promise<RateLimitResult>;
  /** Number of IPs currently tracked by this limiter. */
  size(): number | Promise<number>;
}

/**
 * Creates an IN-MEMORY rate limiter. State lives in a Map bound to the
 * returned function. Use this for tests or local development where a
 * Durable Object is not available.
 */
export function createIpRateLimiter(
  options: IpRateLimiterOptions,
): IpRateLimiter {
  const { windowMs, maxPerWindow, softCap, maxEntries } = options;
  const hits = new Map<string, number[]>();

  const limiter = (ip: string, now: number): RateLimitResult => {
    const ipHits = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (ipHits.length >= maxPerWindow) {
      const oldest = ipHits[0] ?? now;
      return {
        allowed: false,
        retryAfterMs: Math.max(0, oldest + windowMs - now),
      };
    }
    ipHits.push(now);
    hits.set(ip, ipHits);

    if (softCap != null && hits.size > softCap) {
      // Shed fully-expired IPs first, inspecting only a bounded slice of
      // the map per call so the per-request cost stays flat.
      let scanned = 0;
      for (const [key, times] of hits) {
        if (scanned >= MAX_EVICTION_SCAN_PER_CALL) break;
        scanned += 1;
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
      }
    }

    if (hits.size > maxEntries) {
      // Map iteration follows insertion order, so the oldest-first-seen IPs are
      // dropped first. Entries still inside their window are evicted too:
      // under memory pressure the limiter fails open rather than growing
      // without bound.
      for (const key of hits.keys()) {
        if (hits.size <= maxEntries) break;
        hits.delete(key);
      }
    }

    return { allowed: true, retryAfterMs: 0 };
  };

  return Object.assign(limiter, { size: () => hits.size });
}

/**
 * Creates a GLOBAL rate limiter backed by a Durable Object. State lives in
 * the DO's SQLite storage, shared across all isolates. Use this in the
 * deployed Worker (production, staging, dev) so cold starts and concurrent
 * isolates see the same window.
 */
export function createGlobalIpRateLimiter(
  options: IpRateLimiterOptions,
  doNamespace: DurableObjectNamespace,
): IpRateLimiter {
  const { windowMs, maxPerWindow, softCap, maxEntries } = options;
  const stub = doNamespace.get(doNamespace.idFromName('global'));

  const limiter = async (ip: string, now: number): Promise<RateLimitResult> => {
    const res = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, now, windowMs, maxPerWindow, softCap: softCap ?? null, maxEntries }),
    });
    return res.json() as Promise<RateLimitResult>;
  };

  return Object.assign(limiter, {
    async size(): Promise<number> {
      const res = await stub.fetch('https://internal/size', { method: 'GET' });
      const { size } = await res.json() as { size: number };
      return size;
    },
  });
}