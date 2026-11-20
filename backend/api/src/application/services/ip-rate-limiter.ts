/**
 * Per-IP sliding-window rate limiter factory.
 *
 * Extracted so that multiple HTTP routes can share one implementation
 * instead of each defining an inline copy. State is bound to the app
 * instance, so tests get isolation for free: each `createApp` call builds
 * its own limiters. The Worker entrypoint builds ONE app per isolate
 * (see `appFor` in `src/index.ts`), so the window now persists for the
 * lifetime of the isolate instead of being rebuilt per request.
 */

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

export interface IpRateLimiter {
  (ip: string, now: number): { allowed: boolean; retryAfterMs: number };
  /** Number of IPs currently tracked by this limiter. */
  size(): number;
}

export function createIpRateLimiter(
  options: IpRateLimiterOptions,
): IpRateLimiter {
  const { windowMs, maxPerWindow, softCap, maxEntries } = options;
  const hits = new Map<string, number[]>();

  return Object.assign(
    (ip: string, now: number): { allowed: boolean; retryAfterMs: number } => {
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
    },
    { size: () => hits.size },
  );
}
