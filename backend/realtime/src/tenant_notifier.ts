/**
 * TenantNotifier — Durable Object (no cloudflare:workers import).
 *
 * We don't import 'cloudflare:workers' because vitest can't resolve it.
 * Wrangler matches the class by name against wrangler.toml's
 * new_sqlite_classes so typing-vs-runtime is a non-issue.
 *
 * One DO per tenant (id = tenant uid). Holds hibernating WebSocket
 * connections for the admin dashboard and broadcasts sale/session events
 * pushed by daftari-api via service binding (env.REALTIME).
 *
 * WebSocket hibernation: state.acceptWebSocket allows the DO to sleep
 * while connections remain open — zero duration billing when idle.
 */
/** tenantId format: lowercase alphanumeric, hyphens, underscores only. */
const TENANT_ID_RE = /^[a-z0-9_-]+$/;
/** Max tenantId length. */
const MAX_TENANT_ID_LENGTH = 128;

/** Validate tenantId format (IDOR guard: tenantId routes to a Durable Object). */
function validateTenantId(tenantId: string): boolean {
  return (
    tenantId.length > 0 &&
    tenantId.length <= MAX_TENANT_ID_LENGTH &&
    TENANT_ID_RE.test(tenantId)
  );
}

export class TenantNotifier {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    void _env;
    // Answer protocol pings without waking the DO (free).
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** WebSocket upgrade hand-off from the worker route.
   *
   * Requires `X-Tenant-Id` header matching the DO's tenant. On first access,
   * the header value is stored in DO state; subsequent accesses must match.
   * This prevents cross-tenant WS access via a stub obtained for another tenant.
   */
  async fetch(request: Request): Promise<Response> {
    const tenantId = request.headers.get('X-Tenant-Id');
    if (!tenantId || !validateTenantId(tenantId)) {
      return new Response(null, { status: 403 });
    }

    const stored = await this.state.storage.get('tenantId');
    if (stored == null) {
      await this.state.storage.put('tenantId', tenantId);
    } else if (stored !== tenantId) {
      return new Response(null, { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server);
    void request;
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Call from daftari-api via service binding after a sale/sync event.
   *
   * Validates tenantId format (defense-in-depth: /internal/notify already
   * validates, but the DO gate is the final trust boundary).
   */
  async notify(_tenantId: string, event: Record<string, unknown>): Promise<void> {
    if (!_tenantId || !validateTenantId(_tenantId)) {
      throw new Error(`Invalid tenantId: ${_tenantId}`);
    }
    const payload = JSON.stringify(event);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Dead socket — cloudflare will surface cleanup via webSocketError.
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // Already closed
    }
  }

  async webSocketMessage(_ws: WebSocket, _message: ArrayBuffer | string): Promise<void> {
    void _message; // read-only channel — we never act on client messages
    void _ws;
  }
}

/** Exposed so wrangler.toml's new_sqlite_classes can see it. */
export default TenantNotifier;
