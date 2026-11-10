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
import { verifyFirebaseToken } from 'daftari-backend-shared/jwt';
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
import type { FirebaseTokenVerifier } from './application/ports';
import type { FetchFn } from '../../shared/src/types';
import { verifyTagged } from '../../shared/src/password_kdf';
import { DashboardLoginUseCase } from './application/use-cases/dashboard-login-use-case';
import { DashboardLogoutUseCase } from './application/use-cases/dashboard-logout-use-case';
import { OwnerRefreshUseCase } from './application/use-cases/owner-refresh-use-case';
import { AuthSessionResumeUseCase } from './application/use-cases/auth-session-resume-use-case';
import { GetAuthProfileUseCase } from './application/use-cases/get-auth-profile-use-case';
import { SyncFirebaseUserUseCase } from './application/use-cases/sync-firebase-user-use-case';
import { IssueRealtimeTicketUseCase } from './application/use-cases/issue-realtime-ticket-use-case';
import { ValidateRealtimeTicketUseCase } from './application/use-cases/validate-realtime-ticket-use-case';
import { SessionStartUseCase } from './application/use-cases/session-start-use-case';
import { SessionHeartbeatUseCase } from './application/use-cases/session-heartbeat-use-case';
import { SessionEndUseCase } from './application/use-cases/session-end-use-case';
import { SessionListActiveUseCase } from './application/use-cases/session-list-active-use-case';
import { SaleRecordUseCase } from './application/use-cases/sale-record-use-case';
import { SaleListUseCase } from './application/use-cases/sale-list-use-case';
import { AdminSettingsUseCase } from './application/use-cases/admin-settings-use-case';
import { UserListUseCase } from './application/use-cases/user-list-use-case';
import { UserCreateUseCase } from './application/use-cases/user-create-use-case';
import { UserUpdateUseCase } from './application/use-cases/user-update-use-case';
import { UserDeleteUseCase } from './application/use-cases/user-delete-use-case';
import { DeviceLinkUseCase } from './application/use-cases/device-link-use-case';
import { createRealtimeApp, TenantNotifier } from 'daftari-realtime/index';
import { createRealtimeServices, type RealtimeEnv } from 'daftari-realtime/runtime';
import { createPaymobAppFromEnv } from 'daftari-paymob-webhook/runtime';

export interface ApiDeps {
  verifyToken?: FirebaseTokenVerifier;
  getDb?: typeof getDb;
  postHogFetch?: FetchFn;
  /** Injectable KDF verifier (T16): lets a test assert the derivation runs
   *  even for an unknown username. Defaults to the real verifyTagged. */
  verify?: typeof verifyTagged;
  /** Injectable login rate limiter (T17): default is the real sliding window. */
  rateLimit?: (tenantId: string, username: string, ip: string, at: number) => Promise<{ allowed: boolean; retryAfterMs?: number }>;
  /** Shared admin JWT secret used for signing session JWTs. Required — no fallback. */
  adminJwtSecret: string;
  /** Service container built from the real Worker bindings (`env`), not module
   *  scope. Passed in by the fetch handler so secrets are read at request time,
   *  never via `process.env` at load time. */
  services: ApiServices;
}

/** Dashboard origin served by the paired admin_host worker in each
 *  environment (admin_host/wrangler.toml: admin-dev / admin-staging / admin). */
const ADMIN_ORIGINS: Record<string, string> = {
  development: 'https://admin-dev.daftariapp.workers.dev',
  staging: 'https://admin-staging.daftariapp.workers.dev',
  production: 'https://admin.daftariapp.workers.dev',
};

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
    verifyToken: deps.verifyToken ?? verifyFirebaseToken,
    verify: deps.verify ?? verifyTagged,
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
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    saleRecord: useCases.saleRecord,
    saleList: useCases.saleList,
    rateLimit: deps.rateLimit,
  });
  registerAdmin(app, {
    verifyToken: deps.verifyToken,
    getDb: get,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    adminSettings: useCases.adminSettings,
    deviceLink: useCases.deviceLink,
  });
  // After registerAdmin: the /admin/* requireAuth middleware covers these.
  registerUsers(app, {
    verifyToken: deps.verifyToken,
    sessionRepository: deps.services.auth.sessionRepository,
    authUserRepository: deps.services.auth.authUserRepository,
    userRepository: deps.services.auth.userRepository,
    userList: useCases.userList,
    userCreate: useCases.userCreate,
    userUpdate: useCases.userUpdate,
    userDelete: useCases.userDelete,
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
let cachedRealtimeApp: ReturnType<typeof createRealtimeApp> | null = null;
let cachedPaymobApp: ReturnType<typeof createPaymobAppFromEnv> | null = null;

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
  /** Daily cron: mark expired licenses (grace_end in the past). */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    void _event;
    void ctx;
    const db = getDb(env);
    await db.sweepExpiredLicenses(Date.now());
  },
};

export { TenantNotifier };
