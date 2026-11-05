import { describe, expect, it, vi, beforeEach } from 'vitest';

// runtime.ts is the wrangler entrypoint; it value-imports shared's Turso-backed
// modules (tsyringe / @libsql/client) which vitest cannot resolve from here.
// Mock them so the module graph loads, then assert the DO export.
vi.mock('../../shared/src/turso', () => ({
  createTurso: vi.fn(() => ({})),
}));
vi.mock(
  '../../shared/src/infrastructure/repositories/turso-realtime-ticket-repository',
  () => ({
    TursoRealtimeTicketRepository: class {},
  }),
);

import { TenantNotifier } from '../src/runtime';
import { createRealtimeAppFromEnv } from '../src/runtime';
import { createRealtimeApp, type Env } from '../src/index';

vi.mock('../src/index', () => ({
  createRealtimeApp: vi.fn(() => ({ request: vi.fn() } as unknown as ReturnType<typeof import('../src/index')['createRealtimeApp']>)),
  TenantNotifier: class {},
}));

describe('realtime runtime entrypoint', () => {
  it('exports TenantNotifier so wrangler can bind the Durable Object', () => {
    expect(TenantNotifier).toBeDefined();
    expect(typeof TenantNotifier).toBe('function');
  });

  describe('createRealtimeAppFromEnv', () => {
    const baseEnv = {
      TURSO_DB_URL: 'libsql://test.turso.io',
      TURSO_DB_AUTH_TOKEN: 'test-token',
      ADMIN_JWT_SECRET: 'test-jwt-secret',
      INTERNAL_NOTIFY_SECRET: 'test-internal-secret',
    } as Env;

    beforeEach(() => {
      vi.mocked(createRealtimeApp).mockClear();
    });

    it('builds an app from a complete env', () => {
      const app = createRealtimeAppFromEnv(baseEnv);
      expect(app).toBeDefined();
      expect(createRealtimeApp).toHaveBeenCalledTimes(1);
    });

    it('throws when TURSO_DB_URL and TURSO_DB_AUTH_TOKEN are missing', () => {
      expect(() =>
        createRealtimeAppFromEnv({ ...baseEnv, TURSO_DB_URL: '', TURSO_DB_AUTH_TOKEN: '' }),
      ).toThrow('Missing required env vars: TURSO_DB_URL and TURSO_DB_AUTH_TOKEN');
    });

    it('throws when ADMIN_JWT_SECRET is missing', () => {
      expect(() =>
        createRealtimeAppFromEnv({ ...baseEnv, ADMIN_JWT_SECRET: '' }),
      ).toThrow('Missing required env var: ADMIN_JWT_SECRET');
    });

    it('throws when INTERNAL_NOTIFY_SECRET is missing', () => {
      expect(() =>
        createRealtimeAppFromEnv({ ...baseEnv, INTERNAL_NOTIFY_SECRET: '' }),
      ).toThrow('Missing required env var: INTERNAL_NOTIFY_SECRET');
    });
  });
});
