/**
 * Best-effort push to a tenant's Durable Object via the NOTIFIER binding.
 *
 * The binding is absent in local/tests, stays inside Cloudflare, and a failed
 * broadcast must never fail the originating request — so this never rejects.
 */
import type { Env } from './env';

export function notifyRealtime(
  env: Env,
  tenantId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  const notifier = env.NOTIFIER;
  if (!notifier) return Promise.resolve();

  return notifier
    .get(notifier.idFromName(tenantId))
    .notify(tenantId, { tenantId, event, data })
    .then(() => undefined)
    .catch(() => undefined);
}

