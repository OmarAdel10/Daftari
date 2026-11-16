import { describe, expect, it } from 'vitest';

import { createIpRateLimiter } from '../ip-rate-limiter';

describe('createIpRateLimiter', () => {
  it('allows requests below the per-window maximum', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 3 });

    for (let i = 0; i < 3; i += 1) {
      expect(limiter('1.2.3.4', 1_000 + i)).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }
  });

  it('denies the request that exceeds the per-window maximum', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 2 });
    limiter('1.2.3.4', 1_000);
    limiter('1.2.3.4', 2_000);

    expect(limiter('1.2.3.4', 3_000)).toEqual({
      allowed: false,
      retryAfterMs: 58_000,
    });
  });

  it('keeps a separate budget per IP', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 1 });
    limiter('1.2.3.4', 1_000);

    expect(limiter('1.2.3.4', 1_100).allowed).toBe(false);
    expect(limiter('5.6.7.8', 1_100).allowed).toBe(true);
  });

  it('releases the budget once the window has elapsed', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 1 });
    limiter('1.2.3.4', 1_000);

    expect(limiter('1.2.3.4', 61_000).allowed).toBe(true);
  });

  it('does not extend the window when a request is denied', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 1 });
    limiter('1.2.3.4', 1_000);

    expect(limiter('1.2.3.4', 2_000)).toEqual({
      allowed: false,
      retryAfterMs: 59_000,
    });
    // The deadline still belongs to the first admitted hit.
    expect(limiter('1.2.3.4', 10_000)).toEqual({
      allowed: false,
      retryAfterMs: 51_000,
    });
  });

  it('evicts fully-expired IPs once the map exceeds the soft cap', () => {
    const limiter = createIpRateLimiter({
      windowMs: 1_000,
      maxPerWindow: 5,
      softCap: 2,
      maxEntries: 10,
    });
    limiter('1.1.1.1', 0);
    limiter('2.2.2.2', 0);
    limiter('3.3.3.3', 0);
    expect(limiter.size()).toBe(3);

    // Two seconds later every earlier hit is expired, so the next call
    // sheds the stale entries.
    limiter('4.4.4.4', 2_000);

    expect(limiter.size()).toBeLessThanOrEqual(3);
  });

  it('keeps the tracked IP count within the hard bound', () => {
    const limiter = createIpRateLimiter({
      windowMs: 600_000,
      maxPerWindow: 5,
      softCap: 2,
      maxEntries: 3,
    });

    for (let i = 0; i < 20; i += 1) {
      limiter(`10.0.0.${i}`, 1_000);
    }

    expect(limiter.size()).toBeLessThanOrEqual(3);
  });

  it('reports how many IPs are currently tracked', () => {
    const limiter = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 5 });

    expect(limiter.size()).toBe(0);
    limiter('1.1.1.1', 1_000);
    limiter('2.2.2.2', 1_000);
    expect(limiter.size()).toBe(2);
  });
});
