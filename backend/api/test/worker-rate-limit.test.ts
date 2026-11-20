/**
 * Worker-level IP rate-limit persistence (DAFTARI-191 / follow-up #85,
 * DAFTARI-192 / follow-up #86).
 *
 * The Worker entrypoint used to build a fresh Hono app on every request, so
 * every in-memory `createIpRateLimiter` instance was born and died inside a
 * single request and the 30/min window never accumulated. The Worker now
 * builds ONE app per isolate (see `appFor` in `src/index.ts`), so the window
 * must survive across `api.fetch` calls. This test drives the real default
 * export (`api.fetch`) 31 times with the same `CF-Connecting-IP` and asserts:
 *   - the first 30 requests are allowed (they reach the limiter and fail
 *     later in the use case with 401, because no licence/device rows are
 *     seeded),
 *   - the 31st request is rate-limited (429 + `RATE_LIMITED` body),
 *   - a different IP is not affected by the first IP's exhausted budget.
 *
 * Scope of the guarantee: the window persists for the lifetime of the cached
 * app instance, which the Worker keeps for the lifetime of an isolate. A
 * real `workerd` runtime test (cold start, isolate recycle, concurrent
 * isolates) is tracked as DAFTARI-205 / follow-up #99.
 *
 * `Date` is faked so the 60 s window cannot expire while the test runs, and
 * each test uses its own client IPs (the limiter state lives in the
 * module-level app instance that the Worker caches per isolate, so the
 * budgets of the two cases must not overlap and the cases must stay
 * order-independent).
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

const WINDOW_MS = 60_000;

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
    expect(allowed.every((response) => response.status === 401)).toBe(true);

    const limited = responses[30];
    expect(limited?.status).toBe(429);

    const body = (await limited?.json()) as RateLimitedBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe('RATE_LIMITED');
    expect(body.retry_after_ms).toBe(WINDOW_MS);
  });

  it('does not rate-limit a different IP after the first IP is limited', async () => {
    const priming: Response[] = [];
    for (let i = 0; i < 31; i += 1) {
      priming.push(
        await api.fetch(
          startRequest('203.0.113.92'),
          env,
          {} as ExecutionContext,
        ),
      );
    }

    // The primed IP must really be limited, otherwise this case would also
    // pass on the broken base where the app is rebuilt per request.
    const primed = priming[30];
    expect(primed?.status).toBe(429);
    const primedBody = (await primed?.json()) as RateLimitedBody;
    expect(primedBody.error).toBe('RATE_LIMITED');

    const otherIpResponse = await api.fetch(
      startRequest('203.0.113.93'),
      env,
      {} as ExecutionContext,
    );
    // A separate IP must reach the route handler itself: the request is
    // authenticated and passes the limiter, then fails on the missing
    // licence exactly like the allowed requests above (401).
    expect(otherIpResponse.status).toBe(401);

    const otherIpBody = (await otherIpResponse.json()) as RateLimitedBody;
    expect(otherIpBody.error).not.toBe('RATE_LIMITED');
  });
});
