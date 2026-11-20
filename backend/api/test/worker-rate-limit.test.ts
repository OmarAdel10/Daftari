/**
 * Worker-level IP rate-limit persistence (DAFTARI-191 / follow-up #85,
 * DAFTARI-192 / follow-up #86).
 *
 * The Worker entrypoint used to build a fresh Hono app on every request, so
 * every in-memory `createIpRateLimiter` instance was born and died inside a
 * single request and the 30/min window never accumulated. This test drives
 * the real default export (`api.fetch`) 31 times with the same
 * `CF-Connecting-IP` and asserts:
 *   - the first 30 requests are NOT rate-limited,
 *   - the 31st request is rate-limited (429 + `RATE_LIMITED` body),
 *   - a different IP is not affected by the first IP's exhausted budget.
 *
 * Requests 1-30 may fail later in the use case (no licence/device rows are
 * seeded), which is irrelevant: the limiter is consulted after the body
 * guards and before `sessionStart.execute`, so those 30 calls must consume
 * the window regardless of their final status.
 *
 * `Date` is faked so the 60 s window cannot expire while the test runs, and
 * each test uses its own client IP because the limiter state lives in the
 * module-level app instance that the Worker caches per isolate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.hoisted(() => vi.fn());

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({
    execute: executeMock,
    batch: async (statements: unknown[]) => {
      const out = [];
      for (const statement of statements) out.push(await executeMock(statement));
      return out;
    },
  })),
}));

// The Worker hard-codes the real Firebase verifier (RS256 + Google JWKS), so
// the verifier is mocked at the module boundary instead of forging a token.
vi.mock('../../shared/src/jwt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/src/jwt')>();
  return {
    ...actual,
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
  };
});

import api from '../src/index';
import type { Env } from '../src/env';

const env = {
  ENVIRONMENT: 'development',
  FIREBASE_PROJECT_ID: 'daftari-pos',
  TURSO_DATABASE_URL: 'libsql://test.turso.io',
  TURSO_AUTH_TOKEN: 'test-token',
  POSTHOG_API_KEY: 'test-key',
  ADMIN_JWT_SECRET: 'test-admin-jwt-secret',
} as unknown as Env;

const AUTH_HEADERS = {
  Authorization: 'Bearer valid-uid-123',
  'Content-Type': 'application/json',
};

function startRequest(ip: string): Request {
  return new Request('http://localhost/sessions/start', {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'CF-Connecting-IP': ip },
    body: JSON.stringify({
      device_hwid: 'hw-191',
      username: 'owner@daftari.co',
    }),
  });
}

interface RateLimitedBody {
  ok: boolean;
  error?: string;
  retry_after_ms?: number;
}

describe('Worker default export persists the IP rate-limit window', () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [], columns: [], rowsAffected: 0 });
    // Only `Date` is faked so the 60 s window is frozen for the whole test.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows 30 requests from one IP and rate-limits the 31st', async () => {
    const responses: Response[] = [];
    for (let i = 0; i < 31; i += 1) {
      responses.push(
        await api.fetch(
          startRequest('203.0.113.90'),
          env,
          {} as ExecutionContext,
        ),
      );
    }

    const allowed = responses.slice(0, 30);
    expect(allowed.every((response) => response.status !== 429)).toBe(true);

    const limited = responses[30];
    expect(limited?.status).toBe(429);

    const body = (await limited?.json()) as RateLimitedBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.retry_after_ms).toBeGreaterThan(0);
  });

  it('does not rate-limit a different IP after the first IP is limited', async () => {
    for (let i = 0; i < 31; i += 1) {
      await api.fetch(startRequest('203.0.113.90'), env, {} as ExecutionContext);
    }

    const otherIpResponse = await api.fetch(
      startRequest('203.0.113.91'),
      env,
      {} as ExecutionContext,
    );
    expect(otherIpResponse.status).not.toBe(429);

    const otherIpBody = (await otherIpResponse.json()) as RateLimitedBody;
    expect(otherIpBody.error).not.toBe('RATE_LIMITED');
  });
});
