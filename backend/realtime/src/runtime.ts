/**
 * daftari-realtime runtime entry point.
 *
 * Wires the shared Turso-backed RealtimeTicketRepository with realtime-specific
 * services (BroadcastService, TicketValidationService, NotifyUseCase,
 * WebSocketConnectUseCase, RateLimiter) and exports a fully-wired
 * createRealtimeApp() for the Cloudflare Worker runtime.
 *
 * The Durable Object binding (NOTIFIER) and Turso DB credentials come from
 * wrangler.toml environment variables/secrets.
 */
import { createTurso } from '../../shared/src/turso';
import { TursoRealtimeTicketRepository } from '../../shared/src/infrastructure/repositories/turso-realtime-ticket-repository';
import { BroadcastServiceImpl } from './domain/services/broadcast-service.impl';
import { TicketValidationServiceImpl } from './domain/services/ticket-validation-service.impl';
import { RateLimiter } from './infrastructure/services/rate-limiter';
import { InMemoryBroadcastRepository } from './infrastructure/repositories/in-memory-broadcast-repository';
import type { RealtimeDeps } from './index';

export interface RealtimeEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_JWT_SECRET: string;
}

/**
 * Build the realtime services container from the Worker environment.
 *
 * Resolves the shared TursoRealtimeTicketRepository (atomic ticket validation:
 * expiry + single-use + tenant lookup) and constructs all realtime services
 * with injected dependencies. Fail-closed: required env vars must be present
 * before constructing the container.
 *
 * @param env - Cloudflare Worker environment bindings (NOTIFIER DO,
 *   ADMIN_JWT_SECRET, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
 * @returns The service dependency object (RealtimeDeps)
 */
export function createRealtimeServices(env: RealtimeEnv): RealtimeDeps {
  // Fail closed: required env vars must be present before constructing services.
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error(
      'Missing required env vars: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN',
    );
  }
  if (!env.ADMIN_JWT_SECRET) {
    throw new Error('Missing required env var: ADMIN_JWT_SECRET');
  }

  const db = createTurso(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const ticketRepo = new TursoRealtimeTicketRepository(db);
  const broadcastRepo = new InMemoryBroadcastRepository();
  const ticketValidationService = new TicketValidationServiceImpl();
  const broadcastService = new BroadcastServiceImpl();
  const rateLimiter = new RateLimiter(100, 60_000);

  return {
    broadcastService,
    broadcastRepo,
    ticketValidationService,
    ticketRepo,
    rateLimiter,
  };
}

export { TenantNotifier } from './tenant_notifier';
