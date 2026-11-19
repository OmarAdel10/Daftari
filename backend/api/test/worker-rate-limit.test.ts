/**
 * Worker-level IP rate-limit persistence (DAFTARI-191 / follow-up #85).
 *
 * The Worker entrypoint used to build a fresh Hono app on every request, so
 * every in-memory `createIpRateLimiter` instance was born and died inside a
 * single request and the 30/min window never accumulated. This test drives
 * the real default export (`api.fetch`) 31 times with the same
 * `CF-Connecting-IP` and asserts the 31st request is rate-limited.
 *
 * Requests 1-30 may fail later in the use case (no licence/device rows are
 * seeded), which is irrelevant: the limiter is consulted after the body
 * guards and before `sessionStart.execute`, so those 30 calls must consume
 * the window regardless of their final status.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const authHeaders = {
  Authorization: 'Bearer valid-uid-123',
  'Content-Type': 'application/json',
  'CF-Connecting-IP': '203.0.113.90',
};

function startRequest(): Request {
  return new Request('http://localhost/sessions/start', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      device_hwid: 'hw-191',
      username: 'owner@daftari.co',
    }),
  });
}

describe('Worker default export persists the IP rate-limit window', () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [], columns: [], rowsAffected: 0 });
  });

  it('rate-limits the 31st /sessions/start from the same IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const response = await api.fetch(
        startRequest(),
        env,
        {} as ExecutionContext,
      );
      statuses.push(response.status);
    }

    const last = statuses[statuses.length - 1];
    expect(last).toBe(429);

    const finalBody = (await (
      await api.fetch(startRequest(), env, {} as ExecutionContext)
    ).json()) as { ok: boolean; error?: string };
    expect(finalBody.ok).toBe(false);
    expect(finalBody.error).toBe('RATE_LIMITED');
  });
});
