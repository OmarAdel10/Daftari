/**
 * Durable Object unit tests for IpRateLimiter using Miniflare's DO testing.
 *
 * This tests the IpRateLimiter DO logic in a real workerd runtime (via Miniflare),
 * without needing to bundle the entire worker. We test the DO class directly
 * by creating a Miniflare instance with just the DO definitions.
 */

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

// Use vi.hoisted for mocks and async imports
const executeMock = vi.hoisted(() => vi.fn());

// Hoisted mocks - defined before imports
const libsqlMock = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    execute: executeMock,
    batch: async (statements: unknown[]) => {
      const out = [];
      for (const statement of statements) out.push(await executeMock(statement));
      return out;
    },
  })),
}));

const jwtMock = vi.hoisted(() => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'valid-uid-123'
      ? {
          valid: true,
          uid: 'uid-123',
          email: 'owner@daftari.co',
          signInProvider: 'google.com',
          emailVerified: true,
        }
      : { valid: false },
  ),
}));

vi.mock('@libsql/client', () => libsqlMock);
vi.mock('../../shared/src/jwt', () => jwtMock);

// Dynamic imports hoisted via vi.hoisted
const IpRateLimiterModule = vi.hoisted(() => import('../src/application/services/ip-rate-limiter-do'));
const TenantNotifierModule = vi.hoisted(() => import('../../realtime/src/index'));
const ipRateLimiterModule = vi.hoisted(() => import('../src/application/services/ip-rate-limiter'));

const WINDOW_MS = 60_000;

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

async function createMiniflareWithDO(): Promise<{
  mf: Miniflare;
  doNamespace: any;
}> {
  const mf = new Miniflare({
    modules: true,
    scriptPath: './test/miniflare-entry.js',
    durableObjects: {
      IpRateLimiter: 'IpRateLimiter',
      TenantNotifier: 'TenantNotifier',
    },
    persistence: false,
    compatibilityDate: '2024-09-01',
    compatibilityFlags: ['nodejs_compat'],
  });

  const doNamespace = await mf.getDurableObjectNamespace('IpRateLimiter');
  return { mf, doNamespace };
}

describe('IpRateLimiter Durable Object (Miniflare workerd runtime)', { timeout: 15000 }, () => {
  let mf: Miniflare;
  let doNamespace: any;
  let testCounter = 0;

  beforeAll(async () => {
    const setup = await createMiniflareWithDO();
    mf = setup.mf;
    doNamespace = setup.doNamespace;
  });

  afterAll(async () => {
    await mf.dispose();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    // Use a unique DO ID for each test to avoid state pollution
    testCounter += 1;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function getTestId() {
    return `test-${testCounter}`;
  }

  it('creates a DO instance and checks rate limit', async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);

    const key = makeRateLimitKey('tenant-1', '1.2.3.4');
    const now = Date.now();

    // First request - should be allowed
    const resp1 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        now,
        windowMs: WINDOW_MS,
        maxPerWindow: 5,
        maxEntries: 1000,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });

    const result1 = await resp1.json() as RateLimitResult;
    expect(result1.allowed).toBe(true);
    expect(result1.retryAfterMs).toBe(0);
  });

  it('enforces per-window limit', async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);
    const key = makeRateLimitKey('tenant-1', '1.2.3.4');
    const now = Date.now();

    // Make 5 requests (maxPerWindow = 5)
    for (let i = 0; i < 5; i += 1) {
      const resp = await stub.fetch('https://internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          now: now + i,
          windowMs: WINDOW_MS,
          maxPerWindow: 5,
          maxEntries: 1000,
          softCap: 10000,
          overflowPolicy: 'reject',
        }),
      });
      const result = await resp.json() as RateLimitResult;
      expect(result.allowed).toBe(true);
    }

    // 6th request should be rate limited
    const resp6 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        now: now + 5,
        windowMs: WINDOW_MS,
        maxPerWindow: 5,
        maxEntries: 1000,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });
    const result6 = await resp6.json() as RateLimitResult;
    expect(result6.allowed).toBe(false);
    expect(result6.retryAfterMs).toBeGreaterThan(0);
  });

  it('separate budgets per tenant+IP', async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);
    const now = Date.now();

    // Tenant 1 makes 5 requests (maxPerWindow = 5)
    for (let i = 0; i < 5; i += 1) {
      const resp = await stub.fetch('https://internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: makeRateLimitKey('tenant-1', '1.2.3.4'),
          now: now + i,
          windowMs: WINDOW_MS,
          maxPerWindow: 5,
          maxEntries: 1000,
          softCap: 10000,
          overflowPolicy: 'reject',
        }),
      });
      const result = await resp.json() as RateLimitResult;
      expect(result.allowed).toBe(true);
    }

    // Tenant 2 with same IP should have fresh budget
    const respT2 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-2', '1.2.3.4'),
        now: now + 5,
        windowMs: WINDOW_MS,
        maxPerWindow: 5,
        maxEntries: 1000,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });
    const resultT2 = await respT2.json() as RateLimitResult;
    expect(resultT2.allowed).toBe(true);
  });

  it('reject policy: new entries rejected when at capacity', async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);
    const now = Date.now();

    // Fill to maxEntries (3)
    for (let i = 0; i < 3; i += 1) {
      const resp = await stub.fetch('https://internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: makeRateLimitKey(`tenant-${i}`, `1.1.1.${i}`),
          now: now + i,
          windowMs: WINDOW_MS,
          maxPerWindow: 10,
          maxEntries: 3,
          softCap: 10000,
          overflowPolicy: 'reject',
        }),
      });
      const result = await resp.json() as RateLimitResult;
      expect(result.allowed).toBe(true);
    }

    // 4th entry should be rejected
    const resp4 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-new', '1.1.1.99'),
        now: now + 3,
        windowMs: WINDOW_MS,
        maxPerWindow: 10,
        maxEntries: 3,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });
    const result4 = await resp4.json() as RateLimitResult;
    expect(result4.allowed).toBe(false);
    expect(result4.retryAfterMs).toBe(WINDOW_MS);
  });

  it('evict-oldest policy: evicts oldest when at capacity', async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);
    const now = Date.now();

    // Fill to maxEntries (2) with evict-oldest
    const resp1 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-1', '1.1.1.1'),
        now: now,
        windowMs: WINDOW_MS,
        maxPerWindow: 10,
        maxEntries: 2,
        softCap: 10000,
        overflowPolicy: 'evict-oldest',
      }),
    });
    expect((await resp1.json() as RateLimitResult).allowed).toBe(true);

    const resp2 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-2', '1.1.1.2'),
        now: now + 1,
        windowMs: WINDOW_MS,
        maxPerWindow: 10,
        maxEntries: 2,
        softCap: 10000,
        overflowPolicy: 'evict-oldest',
      }),
    });
    expect((await resp2.json() as RateLimitResult).allowed).toBe(true);

    // 3rd entry should evict oldest (tenant-1)
    const resp3 = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-3', '1.1.1.3'),
        now: now + 2,
        windowMs: WINDOW_MS,
        maxPerWindow: 10,
        maxEntries: 2,
        softCap: 10000,
        overflowPolicy: 'evict-oldest',
      }),
    });
    expect((await resp3.json() as RateLimitResult).allowed).toBe(true);

    // tenant-1 should be evicted, so a new request for it gets fresh budget
    const resp1Again = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: makeRateLimitKey('tenant-1', '1.1.1.1'),
        now: now + 3,
        windowMs: WINDOW_MS,
        maxPerWindow: 10,
        maxEntries: 2,
        softCap: 10000,
        overflowPolicy: 'evict-oldest',
      }),
    });
    expect((await resp1Again.json() as RateLimitResult).allowed).toBe(true);
  });

  it('window expiry releases budget', { timeout: 10000 }, async () => {
    const { makeRateLimitKey } = await ipRateLimiterModule;
    const id = doNamespace.idFromName(getTestId());
    const stub = doNamespace.get(id);
    // Use a short window (100ms) for this test to avoid timeout
    const testWindowMs = 100;
    const baseTime = Date.now();

    const key = makeRateLimitKey('tenant-1', '1.2.3.4');
    // Make 5 requests (maxPerWindow = 5)
    for (let i = 0; i < 5; i += 1) {
      const resp = await stub.fetch('https://internal/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          now: baseTime + i,
          windowMs: testWindowMs,
          maxPerWindow: 5,
          maxEntries: 1000,
          softCap: 10000,
          overflowPolicy: 'reject',
        }),
      });
      expect((await resp.json() as RateLimitResult).allowed).toBe(true);
    }

    // 6th request at same time should be denied
    const denied = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        now: baseTime + 5,
        windowMs: testWindowMs,
        maxPerWindow: 5,
        maxEntries: 1000,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });
    expect((await denied.json() as RateLimitResult).allowed).toBe(false);

    // After window expires, should be allowed again
    const allowed = await stub.fetch('https://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        now: baseTime + testWindowMs + 1,
        windowMs: testWindowMs,
        maxPerWindow: 5,
        maxEntries: 1000,
        softCap: 10000,
        overflowPolicy: 'reject',
      }),
    });
    expect((await allowed.json() as RateLimitResult).allowed).toBe(true);
  });
});

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}