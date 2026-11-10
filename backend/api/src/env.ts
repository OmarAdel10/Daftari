/** Environment bindings + request-scoped variables for the api worker. */
export interface Env {
  ENVIRONMENT: string;
  FIREBASE_PROJECT_ID: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  POSTHOG_API_KEY: string;
  /** Signs/verifies dashboard session JWTs (shared with realtime/paymob). */
  ADMIN_JWT_SECRET: string;
  /** Durable Object binding for tenant WebSocket hubs (TenantNotifier). */
  NOTIFIER?: {
    idFromName: (name: string) => string;
    get: (id: string) => { notify: (tenantId: string, event: Record<string, unknown>) => Promise<void>; fetch: (req: Request) => Promise<Response> };
  };
  /** Paymob HMAC secret for webhook signature validation. */
  PAYMOB_HMAC_SECRET?: string;
  /** Ed25519 private key for license signing. */
  ED25519_PRIVATE_KEY?: string;
  /** Ed25519 public key for license verification. */
  ED25519_PUBLIC_KEY?: string;
  /** R2 bucket for tenant branding (logos). */
  LOGOS?: {
    put: (
      key: string,
      value: string | ArrayBuffer | ReadableStream,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>;
    get: (key: string) => Promise<{ body: ReadableStream } | null>;
  };
}

export interface Vars {
  authUid: string;
  authEmail?: string;
  /** Session-JWT path only: the admin account's username. */
  authUsername?: string;
  /** Session-JWT path only: the admin account's role. */
  authRole?: string;
  /** Session-JWT path only: the session row id (the token's `jti`). */
  authSessionId?: string;
  /** True only on the Firebase (owner) path. */
  authIsOwner: boolean;
}
