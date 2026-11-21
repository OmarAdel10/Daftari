/**
 * IpRateLimiter — Durable Object for global per-IP rate limiting.
 *
 * One DO instance (id = "global") holds the sliding-window state for all
 * tracked IPs. The Worker calls it via a service binding, so the window
 * persists across cold starts, isolate recycles, and concurrent isolates.
 *
 * We don't import 'cloudflare:workers' because vitest can't resolve it.
 * Wrangler matches the class by name against wrangler.toml's
 * new_sqlite_classes so typing-vs-runtime is a non-issue.
 */

const GLOBAL_DO_ID = 'global';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimitState {
  hits: Record<string, number[]>;
}

export class IpRateLimiter {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    void _env;
  }

  async check(
    ip: string,
    now: number,
    windowMs: number,
    maxPerWindow: number,
    maxEntries: number,
    softCap: number | null,
  ): Promise<RateLimitResult> {
    // Load state from DO storage
    const stored = (await this.state.storage.get('rateLimitState')) as RateLimitState | undefined;
    const hits = new Map<string, number[]>(
      Object.entries(stored?.hits ?? {}).map(([ip, times]) => [ip, [...times]]),
    );

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

    // Soft cap eviction: shed fully-expired IPs first
    if (softCap != null && hits.size > softCap) {
      const MAX_EVICTION_SCAN_PER_CALL = 1000;
      let scanned = 0;
      for (const [key, times] of hits) {
        if (scanned >= MAX_EVICTION_SCAN_PER_CALL) break;
        scanned += 1;
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
      }
    }

    // Hard bound: evict oldest-first-seen IPs (may evict active ones — fail open)
    if (hits.size > maxEntries) {
      for (const key of hits.keys()) {
        if (hits.size <= maxEntries) break;
        hits.delete(key);
      }
    }

    // Persist state back to DO storage
    const hitsObj: Record<string, number[]> = {};
    for (const [key, times] of hits) {
      hitsObj[key] = times;
    }
    await this.state.storage.put('rateLimitState', { hits: hitsObj });

    return { allowed: true, retryAfterMs: 0 };
  }

  async size(): Promise<number> {
    const stored = (await this.state.storage.get('rateLimitState')) as RateLimitState | undefined;
    return Object.keys(stored?.hits ?? {}).length;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/check' && request.method === 'POST') {
      const { ip, now, windowMs, maxPerWindow, maxEntries, softCap } = await request.json() as {
        ip: string;
        now: number;
        windowMs: number;
        maxPerWindow: number;
        maxEntries: number;
        softCap: number | null;
      };
      const result = await this.check(ip, now, windowMs, maxPerWindow, maxEntries, softCap ?? null);
      return Response.json(result);
    }

    if (path === '/size' && request.method === 'GET') {
      const size = await this.size();
      return Response.json({ size });
    }

    return new Response(null, { status: 404 });
  }
}

/** Exposed so wrangler.toml's new_sqlite_classes can see it. */
export default IpRateLimiter;