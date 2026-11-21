/**
 * Miniflare test entry point for IpRateLimiter DO tests.
 * This file is loaded by Miniflare to provide the DO classes.
 * Uses inline definitions to avoid module resolution issues.
 * Plain JavaScript with JSDoc comments - no TypeScript syntax.
 */

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed
 * @property {number} retryAfterMs
 */

/**
 * @typedef {Object} RateLimitState
 * @property {Object.<string, number[]>} hits
 */

export class IpRateLimiter {
  /**
   * @param {DurableObjectState} state
   * @param {unknown} _env
   */
  constructor(state, _env) {
    this.state = state;
  }

  /**
   * @param {string} key
   * @param {number} now
   * @param {number} windowMs
   * @param {number} maxPerWindow
   * @param {number} maxEntries
   * @param {number|null} softCap
   * @param {'reject'|'evict-oldest'} overflowPolicy
   * @returns {Promise<{allowed: boolean, retryAfterMs: number}>}
   */
  async check(key, now, windowMs, maxPerWindow, maxEntries, softCap, overflowPolicy = 'reject') {
    // Load state from DO storage
    const stored = /** @type {RateLimitState|undefined} */ (await this.state.storage.get('rateLimitState'));
    const hits = new Map(Object.entries(stored?.hits ?? {}).map(([k, times]) => [k, [...times]]));

    const keyHits = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (keyHits.length >= maxPerWindow) {
      const oldest = keyHits[0] ?? now;
      return {
        allowed: false,
        retryAfterMs: Math.max(0, oldest + windowMs - now),
      };
    }
    keyHits.push(now);
    hits.set(key, keyHits);

    // Soft cap eviction: shed fully-expired entries first
    if (softCap != null && hits.size > softCap) {
      const MAX_EVICTION_SCAN_PER_CALL = 1000;
      let scanned = 0;
      for (const [k, times] of hits) {
        if (scanned >= 1000) break;
        scanned += 1;
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }

    // Hard bound: apply overflow policy when map exceeds maxEntries
    if (hits.size > maxEntries) {
      if (overflowPolicy === 'reject') {
        hits.delete(key);
        const hitsObj = {};
        for (const [k, times] of hits) {
          hitsObj[k] = times;
        }
        await this.state.storage.put('rateLimitState', { hits: hitsObj });
        return {
          allowed: false,
          retryAfterMs: windowMs,
        };
      }
      // Legacy 'evict-oldest': evict oldest-first-seen entries
      for (const k of hits.keys()) {
        if (hits.size <= maxEntries) break;
        hits.delete(k);
      }
    }

    // Persist state back to DO storage
    const hitsObj = {};
    for (const [k, times] of hits) {
      hitsObj[k] = times;
    }
    await this.state.storage.put('rateLimitState', { hits: hitsObj });

    return { allowed: true, retryAfterMs: 0 };
  }

  async size() {
    const stored = await this.state.storage.get('rateLimitState');
    return Object.keys(stored?.hits ?? {}).length;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/check' && request.method === 'POST') {
      const { key, now, windowMs, maxPerWindow, maxEntries, softCap, overflowPolicy } = await request.json();
      const result = await this.check(key, now, windowMs, maxPerWindow, maxEntries, softCap ?? null, overflowPolicy);
      return Response.json(result);
    }

    if (path === '/size' && request.method === 'GET') {
      const size = await this.size();
      return Response.json({ size });
    }

    return new Response(null, { status: 404 });
  }
}

export class TenantNotifier {
  constructor(state, _env) {
    this.state = state;
  }

  async fetch(request) {
    return new Response(null, { status: 200 });
  }
}