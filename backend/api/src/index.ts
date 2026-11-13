/**
 * daftari-api — the single authenticated HTTP surface for Daftari POS.
 *
 * Routes: /auth/*, /sessions/*, /sales/*, /admin/*, /events, /branding/*
 * Cron: daily license-expiry sweep (03:00 UTC).
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Vars } from './env';
import { getDb } from './db';
import type { VerifyTokenFn } from './middleware/auth';
import { verifyFirebaseToken } from '../../shared/src/jwt';
import { registerSales } from './routes/sales';
import { registerAdmin } from './routes/admin';
import { registerUsers } from './routes/users';
import { registerAnalytics } from './routes/analytics';
import { registerBranding } from './routes/branding';
import { registerAuth } from './routes/auth';
import { registerSessions } from './routes/sessions';
import { createApiRuntime } from './runtime';
import type { ApiRuntimeEnv, ApiServices } from './application/ports';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { createPaymobAppFromEnv } from '../../paymob-webhook/src/runtime';
import { createRealtimeApp, TenantNotifier } from '../../realtime/src/index';
import { createRealtimeServices, type RealtimeEnv } from '../../realtime/src/runtime';
import { RateLimiter } from '../../shared/src/infrastructure/services/rate-limiter';
import { verifyTagged } from '../../shared/src/password_kdf';
import type { RealtimeTicketRepository } from '../../shared/src/domain/repositories/realtime-ticket-repository';

export interface ApiDeps {
  verifyToken?: FirebaseTokenVerifier;
  getDb?: typeof getDb;
  postHogFetch?: FetchFn;
  verify?: typeof verifyTagged;
  rateLimit?: (tenantId: string, username: string, ip: string, at: number) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
  adminJwtSecret: string;
  services: ApiServices;
}

/** The single browser origin allowed to call the api for a given
 *  ENVIRONMENT. Unknown environments get no origin (deny by default). */
export function adminOriginFor(environment: string | undefined): string | null {
  return (environment && ADMIN_ORIGINS[environment]) || null;
}

/** Resolves the CORS allowlist for a request origin: the environment's admin
 *  origin, plus localhost ONLY in development (T19). */
export function allowedCorsOrigin(
  origin: string,
  environment: string | undefined,
): string | null {
  if (!origin) return null;
  if (environment === 'development' && isLocalhostOrigin(origin)) return origin;
  return adminOriginFor(environment) === origin ? origin : null;
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      (protocol === 'http:' || protocol === 'https:')
    );
  } catch {
    return false;
  }
}

export function createApp(deps: ApiDeps) {
  const get = deps.getDb ?? getDb;
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  // Explicit allowlist (T19) — never a wide-open wildcard. The origin is
  // resolved per request from ENVIRONMENT so dev/staging/production each only
  // echo their own admin_host origin.
  app.use(
    '*',
    cors({
      origin: (origin, c) => allowedCorsOrigin(origin, c.env.ENVIRONMENT),
      allowHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  // Global error handler: maps SyntaxError (malformed JSON) → 400 INVALID_JSON,
  // everything else → 500 INTERNAL (no stack in body).
  app.onError((err, c) => {
    if (err instanceof SyntaxError) {
      return c.json({ ok: false, error: 'INVALID_JSON' }, 400);
    }
    return c.json({ ok: false, error: 'INTERNAL' }, 500);
  });

  app.get('/health', async (c) => {
    const db = get(c.env);
    const schema = await db.checkSchema();
    const schemaOk = schema.authUsers && schema.sessionsSource;
    return c.json({
      ok: schemaOk,
      env: c.env.ENVIRONMENT ?? 'unknown',
      db: schemaOk ? 'ok' : 'unreachable',
      schema: {
        auth_users: schema.authUsers,
        sessions_source: schema.sessionsSource,
        users_last_owner_login_at: schema.usersLastOwnerLoginAt,
      },
    }, schemaOk ? 200 : 503);
  });

  // Services are built from the real Worker bindings (`env`) by the fetch
  // handler (servicesFor) and passed in via deps.services. No module-scope
  // dummy env, no process.env reads — secrets are read at request time.
  const useCases = deps.services.auth;
  registerAuth(app, {
    useCases,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    verifyToken: deps.verifyToken,
    rateLimit: deps.rateLimit,
  });
  registerSessions(app, {
    sessionStart: useCases.sessionStart,
    sessionHeartbeat: useCases.sessionHeartbeat,
    sessionEnd: useCases.sessionEnd,
    sessionListActive: useCases.sessionListActive,
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    rateLimit: deps.rateLimit,
  });
  registerSales(app, {
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    saleRecord: useCases.saleRecord,
    saleList: useCases.saleList,
    rateLimit: deps.rateLimit,
  });
  registerAdmin(app, {
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    adminSettings: useCases.adminSettings,
    deviceLink: useCases.deviceLink,
  });
  registerAnalytics(app, {
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    postHogFetch: deps.postHogFetch,
  });
  registerBranding(app, {
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
  });

  return app;
}

/** Lazily build the service container once from the real Worker bindings,
 *  then reuse it (all requests to a deployment share the same env). Secrets
 *  are read at request time via `env`, never via `process.env` at load time. */
let cachedServices: ApiServices | null = null;

function servicesFor(env: Env): ApiServices {
  if (!cachedServices) {
    cachedServices = createApiRuntime({
      getDb,
      verifyToken: verifyFirebaseToken,
      verify: verifyTagged,
    }).getServices(env as unknown as ApiRuntimeEnv);
  }
  return cachedServices;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // PayMob webhook → paymob app
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const app = paymobAppFor(env);
        return app.fetch(request, env, ctx);
      } catch {
        return Response.json({ ok: false, error: 'paymob not configured' }, { status: 503 });
      }
    }

    // WebSocket upgrade → realtime app
    if (url.pathname === '/ws' && request.method === 'GET') {
      if (!env.NOTIFIER) {
        return Response.json({ ok: false, error: 'realtime not configured' }, { status: 503 });
      }
      try {
        const app = realtimeAppFor(env);
        return app.fetch(request, env, ctx);
      } catch {
        return Response.json({ ok: false, error: 'realtime not configured' }, { status: 503 });
      }
    }

    // API → existing createApp
    let services: ApiServices;
    try {
      services = servicesFor(env);
    } catch {
      return Response.json({ ok: false, error: 'API not configured' }, { status: 503 });
    }
    const app = createApp({
      adminJwtSecret: env.ADMIN_JWT_SECRET,
      services,
      getDb,
      verifyToken: verifyFirebaseToken,
      verify: verifyTagged,
      postHogFetch: fetch,
    });
    return app.fetch(request, env, ctx);
  },
};

function realtimeAppFor(env: Env) {
  if (!env.NOTIFIER) throw new Error('realtime not configured: NOTIFIER binding missing');
  if (!cachedRealtimeApp) {
    const deps = createRealtimeServices(env as unknown as RealtimeEnv);
    cachedRealtimeApp = createRealtimeApp(deps);
  }
  return cachedRealtimeApp;
}

function paymobAppFor(env: Env) {
  if (
    !env.PAYMOB_HMAC_SECRET ||
    !env.ED25519_PRIVATE_KEY ||
    !env.ED25519_PUBLIC_KEY
  ) throw new Error('paymob not configured: Paymob secrets missing');
  if (!cachedPaymobApp) {
    cachedPaymobApp = createPaymobAppFromEnv(env as unknown as Parameters<typeof createPaymobAppFromEnv>[0]);
  }
  return cachedPaymobApp;
}

let cachedRealtimeApp: ReturnType<typeof createRealtimeApp> | null = null;
let cachedPaymobApp: ReturnType<typeof createPaymobAppFromEnv> | null = null;
