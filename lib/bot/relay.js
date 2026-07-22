/**
 * relayToAthlete(clientId, kind, payload)
 *
 * Fires the bot's /relay endpoint so PAX delivers coach feedback to the
 * athlete over WhatsApp — form-review replies and coach notes. Shares the
 * nudge credentials (BOT_URL + NUDGE_SECRET, both already set on Vercel).
 *
 * Always non-fatal: returns true if the relay was accepted, false otherwise.
 * Callers must never fail their own write because the relay didn't send.
 */
export async function relayToAthlete(clientId, kind, payload = {}) {
  try {
    const botUrl = process.env.BOT_URL;
    const secret = process.env.NUDGE_SECRET;
    if (!botUrl || !secret || !clientId) return false;

    const res = await fetch(`${botUrl.replace(/\/$/, '')}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nudge-secret': secret },
      body: JSON.stringify({ client_id: clientId, kind, payload }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[relay] bot returned ${res.status} for ${kind} -> ${clientId}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[relay] failed (non-fatal)', e);
    return false;
  }
}
