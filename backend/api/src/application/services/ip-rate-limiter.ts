/**
 * Per-IP sliding-window rate limiter factory.
 *
 * Extracted so that multiple HTTP routes can share one implementation
 * instead of each defining an inline copy. State is bound to the app
 * instance (fresh per isolate/createApp), so tests get isolation for free
 * and production pays only one window per isolate.
 *
 * @param windowMs - Sliding window length in milliseconds.
 * @param maxPerWindow - Max hits allowed per window per IP.
 * @param softCap - Begin evicting expired IPs once the map exceeds this size.
 * @param hardCap - Stop evicting once the map reaches this size.
 * @returns An `ipRateLimit(ip, now)` predicate returning `{ allowed, retryAfterMs }`.
 */
export interface IpRateLimiterOptions {
  windowMs: number;
  maxPerWindow: number;
  softCap?: number;
  hardCap?: number;
}

export type IpRateLimiter = (
  ip: string,
  now: number,
) => { allowed: boolean; retryAfterMs: number };

export function createIpRateLimiter(
  options: IpRateLimiterOptions,
): IpRateLimiter {
  const { windowMs, maxPerWindow, softCap, hardCap } = options;
  const hits = new Map<string, number[]>();

  return (ip: string, now: number): { allowed: boolean; retryAfterMs: number } => {
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
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
        if (hardCap != null && hits.size <= hardCap) break;
      }
    }
    return { allowed: true, retryAfterMs: 0 };
  };
}
