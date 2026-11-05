import { describe, expect, it, vi } from 'vitest';

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

describe('realtime runtime entrypoint', () => {
  it('exports TenantNotifier so wrangler can bind the Durable Object', () => {
    expect(TenantNotifier).toBeDefined();
    expect(typeof TenantNotifier).toBe('function');
  });
});
