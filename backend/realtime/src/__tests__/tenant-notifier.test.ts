/**
 * TenantNotifier — Durable Object unit tests.
 *
 * Cloudflare-only globals (WebSocketPair, WebSocketRequestResponsePair) are
 * stubbed because vitest runs in Node where they are unavailable. The
 * TenantNotifier itself imports nothing from cloudflare:workers, so it is
 * fully testable in Node with mocked DurableObjectState + WebSocket.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mock WebSocket — send/close are the only methods TenantNotifier calls. */
class MockWebSocket {
  send = vi.fn();
  close = vi.fn();
}

/** Mock WebSocketPair — [0] = client, [1] = server. */
class MockWebSocketPair {
  '0': MockWebSocket;
  '1': MockWebSocket;
  constructor() {
    this['0'] = new MockWebSocket();
    this['1'] = new MockWebSocket();
  }
}

/** Mock WebSocketRequestResponsePair — protocol auto-response pair. */
class MockWebSocketRequestResponsePair {
  constructor(public request: string, public response: string) {}
}

/** Mock Response — Cloudflare allows status 101 + webSocket; Node doesn't. */
class MockResponse {
  status: number;
  constructor(_body: unknown, init?: { status?: number }) {
    this.status = init?.status ?? 200;
  }
}

/** Stub Cloudflare-only globals before TenantNotifier module is evaluated. */
vi.stubGlobal('WebSocketPair', MockWebSocketPair);
vi.stubGlobal('WebSocketRequestResponsePair', MockWebSocketRequestResponsePair);
vi.stubGlobal('Response', MockResponse);
// WebSocket is available in Node 22 vitest environment.

import { TenantNotifier } from '../tenant_notifier';

/** Mock DurableObjectState — the only constructor dependency. */
class MockDurableObjectState {
  webSockets: MockWebSocket[] = [];
  autoResponse: MockWebSocketRequestResponsePair | null = null;
  acceptedSocket: MockWebSocket | null = null;
  private _store: Map<string, unknown> = new Map();

  getWebSockets() {
    return this.webSockets;
  }

  setWebSocketAutoResponse(pair: MockWebSocketRequestResponsePair) {
    this.autoResponse = pair;
  }

  acceptWebSocket(ws: MockWebSocket) {
    this.acceptedSocket = ws;
  }

  get storage() {
    return {
      get: (key: string) => this._store.get(key),
      put: (key: string, value: unknown) => this._store.set(key, value),
    };
  }
}

describe('TenantNotifier — Durable Object', () => {
  let state: MockDurableObjectState;
  let notifier: TenantNotifier;

  beforeEach(() => {
    state = new MockDurableObjectState();
    notifier = new TenantNotifier(
      state as unknown as DurableObjectState,
      {},
    );
  });

  describe('constructor', () => {
    it('sets ping/pong auto-response so the DO can hibernate', () => {
      expect(state.autoResponse).toBeDefined();
      expect(state.autoResponse!.request).toBe('ping');
      expect(state.autoResponse!.response).toBe('pong');
    });
  });

  describe('fetch — WebSocket upgrade hand-off', () => {
    it('returns 101 with client socket and accepts server socket', async () => {
      const res = await notifier.fetch(
        new Request('https://example.com/ws', {
          headers: { upgrade: 'websocket', 'x-tenant-id': 'tenant-1' },
        }),
      );
      expect(res.status).toBe(101);
      expect(state.acceptedSocket).toBeInstanceOf(MockWebSocket);
      // [1] = server socket accepted, [0] = client returned in Response
    });

    it('rejects WebSocket upgrade without X-Tenant-Id header → 403', async () => {
      const res = await notifier.fetch(
        new Request('https://example.com/ws', { headers: { upgrade: 'websocket' } }),
      );
      expect(res.status).toBe(403);
    });

    it('accepts WebSocket upgrade with matching X-Tenant-Id on first access', async () => {
      const req = new Request('https://example.com/ws', {
        headers: { upgrade: 'websocket', 'x-tenant-id': 'tenant-1' },
      });
      const res = await notifier.fetch(req);
      expect(res.status).toBe(101);
      expect(await state.storage.get('tenantId')).toBe('tenant-1');
    });

    it('rejects WebSocket upgrade with mismatched X-Tenant-Id → 403', async () => {
      // First access claims the DO for tenant-1
      await notifier.fetch(
        new Request('https://example.com/ws', {
          headers: { upgrade: 'websocket', 'x-tenant-id': 'tenant-1' },
        }),
      );
      // Second access with a different tenant is rejected
      const res = await notifier.fetch(
        new Request('https://example.com/ws', {
          headers: { upgrade: 'websocket', 'x-tenant-id': 'tenant-2' },
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe('notify — fan-out to tenant WebSocket sessions', () => {
    it('broadcasts JSON event to every connected WebSocket', async () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();
      state.webSockets = [ws1, ws2];

      const event = { type: 'sale', count: 3, tenantId: 'tenant-1' };
      await notifier.notify('tenant-1', event);

      const payload = JSON.stringify(event);
      expect(ws1.send).toHaveBeenCalledWith(payload);
      expect(ws2.send).toHaveBeenCalledWith(payload);
    });

    it('rejects notify with empty tenantId → throws', async () => {
      await expect(
        notifier.notify('', { type: 'sale' }),
      ).rejects.toThrow(/tenantId/);
    });

    it('rejects notify with invalid tenantId format → throws', async () => {
      await expect(
        notifier.notify('../evil', { type: 'sale' }),
      ).rejects.toThrow(/tenantId/);
    });

    it('rejects notify with tenantId exceeding max length → throws', async () => {
      const longId = 'a'.repeat(129);
      await expect(
        notifier.notify(longId, { type: 'sale' }),
      ).rejects.toThrow(/tenantId/);
    });

    it('ignores dead sockets without throwing', async () => {
      const deadWs = new MockWebSocket();
      deadWs.send = vi.fn(() => {
        throw new Error('dead socket');
      });
      state.webSockets = [deadWs];

      // Dead socket must not propagate the error
      await expect(
        notifier.notify('tenant-1', { type: 'sale' }),
      ).resolves.toBeUndefined();
    });

    it('does nothing when no sockets are connected', async () => {
      state.webSockets = [];
      await expect(
        notifier.notify('tenant-1', { type: 'sale' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('webSocketClose — close a socket', () => {
    it('closes the socket', async () => {
      const ws = new MockWebSocket();
      await notifier.webSocketClose(ws as unknown as WebSocket);
      expect(ws.close).toHaveBeenCalled();
    });

    it('tolerates an already-closed socket', async () => {
      const ws = new MockWebSocket();
      ws.close = vi.fn(() => {
        throw new Error('already closed');
      });
      await expect(
        notifier.webSocketClose(ws as unknown as WebSocket),
      ).resolves.toBeUndefined();
    });
  });

  describe('webSocketMessage — read-only channel', () => {
    it('is a no-op — client messages are never acted on', async () => {
      const ws = new MockWebSocket();
      await expect(
        notifier.webSocketMessage(ws as unknown as WebSocket, 'client message'),
      ).resolves.toBeUndefined();
    });
  });
});
