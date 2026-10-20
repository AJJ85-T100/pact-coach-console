/**
 * relayToAthlete(clientId, kind, payload)
 *
 * Coach feedback to the athlete through PAX (form-review replies, coach
 * notes), via the engine as the signed-in coach: /v1/coach/relay/:clientId.
 * PAX passes the coach's words on intact, by push or Telegram.
 *
 * Always non-fatal: true if it went out, false otherwise. Callers must never
 * fail their own write because the relay didn't send.
 */
import { engineFetch } from '@/lib/engine';

export async function relayToAthlete(clientId, kind, payload = {}) {
  if (!clientId) return false;
  const { status, json } = await engineFetch(`/v1/coach/relay/${encodeURIComponent(clientId)}`, {
    method: 'POST',
    body: JSON.stringify({ kind, payload }),
  });
  if (status !== 200) {
    console.warn(`[relay] engine returned ${status} for ${kind}: ${json?.error || ''}`);
    return false;
  }
  return json?.ok === true;
}
