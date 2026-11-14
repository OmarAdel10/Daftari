import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRealtimeApp } from '../src/index';
import type { Env } from '../src/index';
import { RateLimiter } from '../src/infrastructure/services/rate-limiter';
import { InMemoryBroadcastRepository } from '../src/infrastructure/repositories/in-memory-broadcast-repository';
import { InMemoryRealtimeTicketRepository } from '../src/infrastructure/repositories/in-memory-realtime-ticket-repository';
import { TicketValidationServiceImpl } from '../src/domain/services/ticket-validation-service.impl';
import { BroadcastServiceImpl } from '../src/domain/services/broadcast-service.impl';

// Test-only: pretend the DO stub is sync-fetch with 101 upgrade.
const notifier = {
  notify: vi.fn(async (_tenantId: string, _event: Record<string, unknown>) => undefined),
  fetch: vi.fn(async () => new Response('ok', { status: 200 })),
};

const notifierNamespace = {
  idFromName: vi.fn((name: string) => name),
  get: vi.fn(() => notifier),
};

const JWT_SECRET = 'test-rt-secret';

const env: Env = {
  NOTIFIER: notifierNamespace as unknown as Env['NOTIFIER'],
  ADMIN_JWT_SECRET: JWT_SECRET,
  TURSO_DATABASE_URL: 'libsql://test.turso.io',
  TURSO_AUTH_TOKEN: 'test-token',
};

const ticketRepo = new InMemoryRealtimeTicketRepository();
const broadcastRepo = new InMemoryBroadcastRepository();
const ticketValidationService = new TicketValidationServiceImpl();
const broadcastService = new BroadcastServiceImpl();

const app = createRealtimeApp({
  broadcastService,
  broadcastRepo,
  ticketValidationService,
  ticketRepo,
});

// Strict rate limiter for rate-limit tests (1 request per minute).
const rateLimiterApp = createRealtimeApp({
  broadcastService,
  broadcastRepo,
  ticketValidationService,
  ticketRepo,
  rateLimiter: new RateLimiter(1, 60_000),
});

function b64urlEncode(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeTestJwt(
  secret: string,
  payload: Record<string, unknown>,
  alg = 'HS256',
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload = {
    aud: 'daftari-admin',
    iss: 'daftari-api',
    exp: nowSec + 3600,
    nbf: nowSec,
    ...payload,
  };
  const header = b64urlEncode({ alg, typ: 'JWT' });
  const payloadB64 = b64urlEncode(fullPayload);
  const data = new TextEncoder().encode(`${header}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const sigBytes = new Uint8Array(sig);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.length; i += 1) {
    sigBinary += String.fromCharCode(sigBytes[i]!);
  }
  const sigB64 = btoa(sigBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${payloadB64}.${sigB64}`;
}

// Seed a valid ticket for /ws tests
beforeEach(async () => {
  notifier.notify.mockClear();
  notifier.fetch.mockClear();
  notifierNamespace.idFromName.mockClear();
  notifierNamespace.get.mockClear();
});

describe('realtime worker routes', () => {
  // POST /internal/notify has been removed — api now calls the DO stub directly.

  it('POST /internal/notify is removed → 404', async () => {
    const res = await app.request('/internal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: 'uid-123', event: 'sale', data: { n: 1 } }),
    }, env);
    expect(res.status).toBe(404);
  });

  it('GET /ws rate limits excessive requests → 429', async () => {
    await ticketRepo.insert({
      ticket: 'ws-rl-ticket',
      tenantId: 'uid-rl',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    // First request allowed
    const res1 = await rateLimiterApp.request('/ws?ticket=ws-rl-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res1.status).toBe(200);
    // Second request within window → 429
    const res2 = await rateLimiterApp.request('/ws?ticket=ws-rl-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res2.status).toBe(429);
  });

  it('GET /ws post-auth rate limit → 429 when per-tenant quota exhausted', async () => {
    // Two valid tickets for the same tenant
    await ticketRepo.insert({
      ticket: 'ws-pa-ticket-1',
      tenantId: 'uid-pa',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    await ticketRepo.insert({
      ticket: 'ws-pa-ticket-2',
      tenantId: 'uid-pa',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    // Request 1 from IP 1 → pre-auth passes, post-auth count=1 (allowed)
    const res1 = await rateLimiterApp.request('/ws?ticket=ws-pa-ticket-1', {
      headers: { 'CF-Connecting-IP': '10.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res1.status).toBe(200);
    // Request 2 from IP 2 → pre-auth passes (new IP), post-auth count=2 > maxHits=1 → 429
    const res2 = await rateLimiterApp.request('/ws?ticket=ws-pa-ticket-2', {
      headers: { 'CF-Connecting-IP': '10.0.0.2', Upgrade: 'websocket' },
    }, env);
    expect(res2.status).toBe(429);
    const json = await res2.json();
    expect(json).toMatchObject({ ok: false, error: 'RATE_LIMITED' });
  });

  // ---- Ticket-based WebSocket authentication ----

  it('GET /ws without ticket → 401 Missing ticket', async () => {
    const res = await app.request('/ws', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Missing ticket' });
  });

  it('GET /ws without client IP → 400 Missing client IP', async () => {
    const res = await app.request('/ws', {}, env);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Missing client IP' });
  });

  it('GET /ws with invalid ticket → 401 Invalid or expired ticket', async () => {
    const res = await app.request('/ws?ticket=invalid-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with valid ticket → routes to DO stub', async () => {
    await ticketRepo.insert({
      ticket: 'valid-ticket-123',
      tenantId: 'uid-123',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    const res = await app.request('/ws?ticket=valid-ticket-123', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(200);
    expect(notifier.fetch).toHaveBeenCalled();
  });

  it('GET /ws with valid ticket but no upgrade header → 426 (ticket not consumed)', async () => {
    await ticketRepo.insert({
      ticket: 'valid-ticket-no-upgrade',
      tenantId: 'uid-123',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    const res = await app.request('/ws?ticket=valid-ticket-no-upgrade', { headers: { 'CF-Connecting-IP': '127.0.0.1' } }, env);
    expect(res.status).toBe(426);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Upgrade required' });
    // Ticket must still be valid (not consumed) since upgrade was checked first
    const res2 = await app.request('/ws?ticket=valid-ticket-no-upgrade', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res2.status).toBe(200);
  });

  it('GET /ws with expired ticket → 401', async () => {
    await ticketRepo.insert({
      ticket: 'expired-ticket',
      tenantId: 'uid-123',
      expiresAt: 1,
      createdAt: 0,
    });
    const res = await app.request('/ws?ticket=expired-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with already-used ticket → 401', async () => {
    // The valid ticket gets consumed by the previous test; insert a fresh one then consume it
    await ticketRepo.insert({
      ticket: 'used-ticket',
      tenantId: 'uid-123',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    await ticketRepo.validateAndConsume('used-ticket', Date.now());
    const res = await app.request('/ws?ticket=used-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  // ---- Bearer JWT WebSocket authentication (spec: PRD.md /ws auth) ----

  it('GET /ws with valid Bearer JWT → routes to DO stub', async () => {
    const token = await makeTestJwt(JWT_SECRET, { tid: 'uid-456' });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(200);
    expect(notifier.fetch).toHaveBeenCalled();
    expect(notifierNamespace.idFromName).toHaveBeenCalledWith('uid-456');
  });

  it('GET /ws with invalid Bearer JWT → 401', async () => {
    const res = await app.request('/ws', {
      headers: { Authorization: 'Bearer not-a-jwt', 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with wrong-secret Bearer JWT → 401', async () => {
    const token = await makeTestJwt('wrong-secret', { tid: 'uid-456' });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  // ---- JWT security: exp / nbf / aud / iss ----

  it('GET /ws with expired JWT (exp in past) → 401', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await makeTestJwt(JWT_SECRET, {
      tid: 'uid-456',
      exp: nowSec - 100,
    });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with not-yet-valid JWT (nbf in future) → 401', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await makeTestJwt(JWT_SECRET, {
      tid: 'uid-456',
      nbf: nowSec + 100,
    });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with wrong aud → 401', async () => {
    const token = await makeTestJwt(JWT_SECRET, {
      tid: 'uid-456',
      aud: 'other-service',
    });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with wrong iss → 401', async () => {
    const token = await makeTestJwt(JWT_SECRET, {
      tid: 'uid-456',
      iss: 'other-service',
    });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with JWT tenantId invalid format → 401', async () => {
    const token = await makeTestJwt(JWT_SECRET, {
      tid: 'Invalid Tenant!',
    });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with ticket having invalid-format tenantId → 401', async () => {
    await ticketRepo.insert({
      ticket: 'bad-tenant-ticket',
      tenantId: 'Invalid Tenant!',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });
    const res = await app.request('/ws?ticket=bad-tenant-ticket', {
      headers: { 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with non-HS256 JWT alg → 401', async () => {
    const token = await makeTestJwt(JWT_SECRET, { tid: 'uid-456' }, 'RS256');
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with JWT tenantId non-string → 401', async () => {
    const token = await makeTestJwt(JWT_SECRET, { tid: 12345 });
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  it('GET /ws with malformed JWT payload (triggers verify catch) → 401', async () => {
    const header = b64urlEncode({ alg: 'HS256' });
    const badPayloadB64 = btoa('{not valid json')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const data = new TextEncoder().encode(`${header}.${badPayloadB64}`);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, data);
    const sigBytes = new Uint8Array(sig);
    let sigBinary = '';
    for (let i = 0; i < sigBytes.length; i += 1) {
      sigBinary += String.fromCharCode(sigBytes[i]!);
    }
    const sigB64 = btoa(sigBinary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const token = `${header}.${badPayloadB64}.${sigB64}`;
    const res = await app.request('/ws', {
      headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': '127.0.0.1', Upgrade: 'websocket' },
    }, env);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: 'Invalid or expired ticket' });
  });

  // ---- In-memory repository coverage (temporary, Phase 4 replaces with Turso) ----

  it('InMemoryBroadcastRepository.getRecentForTenant returns newest first', async () => {
    const now = Date.now();
    await broadcastRepo.insert({ id: 'bc-1', tenantId: 't1', type: 'sale', data: {}, createdAt: now - 2000 });
    await broadcastRepo.insert({ id: 'bc-2', tenantId: 't1', type: 'session', data: {}, createdAt: now - 1000 });
    await broadcastRepo.insert({ id: 'bc-3', tenantId: 't2', type: 'sale', data: {}, createdAt: now });

    const recent = await broadcastRepo.getRecentForTenant('t1', 5);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.id).toBe('bc-2');
    expect(recent[1]!.id).toBe('bc-1');

    const limited = await broadcastRepo.getRecentForTenant('t1', 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]!.id).toBe('bc-2');

    const empty = await broadcastRepo.getRecentForTenant('nonexistent', 5);
    expect(empty).toHaveLength(0);
  });

  it('InMemoryRealtimeTicketRepository.sweepExpired removes expired tickets', async () => {
    const now = Date.now();
    await ticketRepo.insert({
      ticket: 'expired-soon',
      tenantId: 't1',
      expiresAt: now - 1000,
      createdAt: now - 2000,
    });
    await ticketRepo.insert({
      ticket: 'still-valid',
      tenantId: 't1',
      expiresAt: now + 60_000,
      createdAt: now,
    });

    await ticketRepo.sweepExpired(now);

    // Expired ticket is gone
    const expired = await ticketRepo.validateAndConsume('expired-soon', now);
    expect(expired).toEqual({ valid: false, error: 'INVALID_TICKET' });

    // Valid ticket still works
    const valid = await ticketRepo.validateAndConsume('still-valid', now);
    expect(valid).toEqual({ valid: true, tenantId: 't1' });
  });
});
