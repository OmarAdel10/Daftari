import { describe, expect, expectTypeOf, it } from 'vitest';

import { createIpRateLimiter } from '../ip-rate-limiter';

describe('createIpRateLimiter', () => {
  it('allows requests below the per-window maximum', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 3,
      maxEntries: 1_000,
    });

    for (let i = 0; i < 3; i += 1) {
      expect(await limiter('1.2.3.4', 1_000 + i)).toEqual({
        allowed: true,
        retryAfterMs: 0,
      });
    }
  });

  it('denies the request that exceeds the per-window maximum', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 2,
      maxEntries: 1_000,
    });
    await limiter('1.2.3.4', 1_000);
    await limiter('1.2.3.4', 2_000);

    expect(await limiter('1.2.3.4', 3_000)).toEqual({
      allowed: false,
      retryAfterMs: 58_000,
    });
  });

  it('keeps a separate budget per IP', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 1,
      maxEntries: 1_000,
    });
    await limiter('1.2.3.4', 1_000);

    expect((await limiter('1.2.3.4', 1_100)).allowed).toBe(false);
    expect((await limiter('5.6.7.8', 1_100)).allowed).toBe(true);
  });

  it('releases the budget once the window has elapsed', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 1,
      maxEntries: 1_000,
    });
    await limiter('1.2.3.4', 1_000);

    expect((await limiter('1.2.3.4', 61_000)).allowed).toBe(true);
  });

  it('does not extend the window when a request is denied', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 1,
      maxEntries: 1_000,
    });
    await limiter('1.2.3.4', 1_000);

    expect(await limiter('1.2.3.4', 2_000)).toEqual({
      allowed: false,
      retryAfterMs: 59_000,
    });
    // The deadline still belongs to the first admitted hit.
    expect(await limiter('1.2.3.4', 10_000)).toEqual({
      allowed: false,
      retryAfterMs: 51_000,
    });
  });

  it('evicts fully-expired IPs once the map exceeds the soft cap', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 1_000,
      maxPerWindow: 5,
      softCap: 2,
      maxEntries: 10,
    });
    await limiter('1.1.1.1', 0);
    await limiter('2.2.2.2', 0);
    await limiter('3.3.3.3', 0);
    expect(limiter.size()).toBe(3);

    // Two seconds later every earlier hit is expired, so the next call
    // sheds the stale entries and keeps only the fresh IP.
    await limiter('4.4.4.4', 2_000);

    expect(limiter.size()).toBe(1);
  });

  it('keeps the tracked IP count within the hard bound', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 600_000,
      maxPerWindow: 5,
      softCap: 2,
      maxEntries: 3,
    });

    for (let i = 0; i < 20; i += 1) {
      await limiter(`10.0.0.${i}`, 1_000);
    }

    expect(limiter.size()).toBe(3);
  });

  it('fails open with a fresh budget when the hard bound evicts an active IP', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 1,
      maxEntries: 1,
    });

    expect(await limiter('1.1.1.1', 1_000)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    // The second IP pushes the map past the hard bound, so the oldest
    // tracked IP is dropped even though its window is still open.
    expect(await limiter('2.2.2.2', 1_000)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(limiter.size()).toBe(1);

    // The evicted IP is re-admitted with a fresh budget instead of being
    // denied for a window it can no longer be tracked against.
    expect(await limiter('1.1.1.1', 1_100)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(await limiter('1.1.1.1', 1_200)).toEqual({
      allowed: false,
      retryAfterMs: 59_900,
    });
  });

  it('bounds expired-entry eviction work per call and finishes it over repeated calls', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 1_000,
      maxPerWindow: 100,
      softCap: 10,
      maxEntries: 2_000,
    });

    for (let i = 0; i < 1_500; i += 1) {
      await limiter(`10.0.${Math.floor(i / 256)}.${i % 256}`, 0);
    }
    expect(limiter.size()).toBe(1_500);

    // One call must not shed every expired entry: eviction work is bounded
    // per call so a single request cannot scan the whole map.
    await limiter('192.0.2.1', 2_000);
    expect(await limiter.size()).toBeGreaterThan(1);

    let calls = 1;
    while ((await limiter.size()) > 1 && calls < 20) {
      await limiter('192.0.2.1', 2_000);
      calls += 1;
    }

    expect(limiter.size()).toBe(1);
  });

  it('reports how many IPs are currently tracked', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 5,
      maxEntries: 1_000,
    });

    expect(limiter.size()).toBe(0);
    await limiter('1.1.1.1', 1_000);
    await limiter('2.2.2.2', 1_000);
    expect(limiter.size()).toBe(2);
  });

  it('keeps an active IP and its remaining budget when the soft cap sheds expired IPs', async () => {
    const limiter = createIpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 2,
      softCap: 2,
      maxEntries: 10,
    });

    await limiter('2.2.2.2', 0);
    await limiter('3.3.3.3', 0);
    await limiter('4.4.4.4', 0);
    expect(limiter.size()).toBe(3);

    // The three earlier IPs are one full window old, so this call sheds
    // them while the newly-seen IP is still inside its own window.
    expect(await limiter('1.1.1.1', 60_000)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(limiter.size()).toBe(1);

    // The surviving IP keeps the budget it already spent: the second hit
    // is admitted and the third is denied against the first hit.
    expect(await limiter('1.1.1.1', 60_001)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
    expect(await limiter('1.1.1.1', 60_002)).toEqual({
      allowed: false,
      retryAfterMs: 59_998,
    });
  });

  it('cannot be constructed without a hard entry bound', () => {
    // Compile-time contract: a limiter without maxEntries would grow its
    // map without limit, so the option must stay required and non-optional.
    expectTypeOf<
      Parameters<typeof createIpRateLimiter>[0]['maxEntries']
    >().toEqualTypeOf<number>();
  });
});
