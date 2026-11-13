/**
 * Unit tests for the paymob webhook IP rate limiter.
 *
 * Simple fixed-window in-memory rate limiter (temporary until Phase 5/6
 * distributed rate limiter).
 */
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
  });

  it('rejects requests over the limit', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
    const res = limiter.check('ip-1');
    expect(res.allowed).toBe(false);
    expect(res.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-2').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
  });

  it('resets after window expires', () => {
    const limiter = new RateLimiter(1, 50);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
    // Manually expire the bucket by setting resetAt to the past
    const entry = (limiter as any).buckets.get('ip-1')!;
    entry.resetAt = Date.now() - 1000;
    expect(limiter.check('ip-1').allowed).toBe(true);
  });
});
