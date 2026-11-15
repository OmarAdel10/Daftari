import { describe, expect, it, vi, beforeEach } from 'vitest';

// runtime.ts value-imports shared's Turso-backed modules which vitest cannot
// resolve from here. Mock them via the package specifier so the module graph
// loads, then assert the DO export and the new services factory.
vi.mock('daftari-backend-shared/turso', () => ({
  createTurso: vi.fn(() => ({})),
}));
vi.mock('daftari-backend-shared/infrastructure/repositories/turso-realtime-ticket-repository', () => ({
  TursoRealtimeTicketRepository: class {},
}));

import { createTurso } from 'daftari-backend-shared/turso';
import { TenantNotifier } from '../src/runtime';
import { createRealtimeServices } from '../src/runtime';

vi.mock('../src/index', () => ({
  createRealtimeApp: vi.fn(() => ({ request: vi.fn() } as unknown as ReturnType<typeof import('../src/index')['createRealtimeApp']>)),
  TenantNotifier: class {},
}));

describe('realtime runtime entrypoint', () => {
  it('exports TenantNotifier so wrangler can bind the Durable Object', () => {
    expect(TenantNotifier).toBeDefined();
    expect(typeof TenantNotifier).toBe('function');
  });

  describe('createRealtimeServices', () => {
    const baseEnv = {
      TURSO_DATABASE_URL: 'libsql://test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
      ADMIN_JWT_SECRET: 'test-jwt-secret',
    };

    beforeEach(() => {
      vi.mocked(createTurso).mockClear();
    });

    it('builds services from a complete RealtimeEnv', () => {
      const deps = createRealtimeServices(baseEnv);
      expect(deps).toBeDefined();
      expect(deps.broadcastService).toBeDefined();
      expect(deps.broadcastRepo).toBeDefined();
      expect(deps.ticketValidationService).toBeDefined();
      expect(deps.ticketRepo).toBeDefined();
      expect(deps.rateLimiter).toBeDefined();
    });

    it('calls createTurso with the Turso URL and auth token', () => {
      createRealtimeServices(baseEnv);
      expect(createTurso).toHaveBeenCalledWith(
        'libsql://test.turso.io',
        'test-token',
      );
    });

    it('throws when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are missing', () => {
      expect(() =>
        createRealtimeServices({
          ...baseEnv,
          TURSO_DATABASE_URL: '',
          TURSO_AUTH_TOKEN: '',
        }),
      ).toThrow('Missing required env vars: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    });

    it('throws when ADMIN_JWT_SECRET is missing', () => {
      expect(() =>
        createRealtimeServices({ ...baseEnv, ADMIN_JWT_SECRET: '' }),
      ).toThrow('Missing required env var: ADMIN_JWT_SECRET');
    });
  });
});
