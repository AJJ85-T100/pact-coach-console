/**
 * lib/bot/calendar.js
 *
 * The bot is the platform's calendar broker (it holds the Google OAuth app
 * credentials). Two thin helpers over its secret-gated endpoints, sharing
 * the relay credentials (BOT_URL + NUDGE_SECRET, both already on Vercel):
 *
 *   coachConnectUrl(coachId, returnTo) — mint the "Connect Google Calendar"
 *     URL for the settings page. Returns null when the bot has no Google
 *     credentials configured yet (the UI hides the button).
 *
 *   sendCoachCalendarEvent(payload)    — appointment scheduled/cancelled →
 *     event in the coach's diary. Google if they're connected, .ics email
 *     fallback if not. Always non-fatal: scheduling must never fail because
 *     the calendar write didn't land.
 */

const botUrl = () => (process.env.BOT_URL || '').replace(/\/$/, '');

async function botPost(path, body, timeoutMs = 15000) {
  const base = botUrl();
  const secret = process.env.NUDGE_SECRET;
  if (!base || !secret) return null;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nudge-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    console.warn(`[calendar] bot ${path} returned ${res.status}`);
    return null;
  }
  return res.json();
}

export async function coachConnectUrl(coachId, returnTo) {
  try {
    const j = await botPost('/calendar/oauth-url', { role: 'coach', id: coachId, return: returnTo });
    return j?.configured ? j.url : null;
  } catch (e) {
    console.error('[calendar] connect-url failed (non-fatal)', e);
    return null;
  }
}

export async function coachCalendarStatus(coachId) {
  try {
    const base = botUrl();
    const secret = process.env.NUDGE_SECRET;
    if (!base || !secret) return { connected: false, configured: false };
    // Authenticated (bot review H2): /calendar/status returns the connected
    // Google address and used to hand it to anyone who supplied a UUID. This
    // runs server-side, so the shared secret never reaches a browser.
    const res = await fetch(`${base}/calendar/status?role=coach&id=${encodeURIComponent(coachId)}`, {
      headers: { 'x-nudge-secret': secret },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!res.ok) return { connected: false, configured: false };
    return res.json();
  } catch (e) {
    console.error('[calendar] status failed (non-fatal)', e);
    return { connected: false, configured: false };
  }
}

// action: 'create' | 'cancel'
// Returns { method: 'google'|'ics'|'none', event_id? } or null on failure.
export async function sendCoachCalendarEvent(payload) {
  try {
    return await botPost('/calendar/event', payload, 20000);
  } catch (e) {
    console.error('[calendar] event failed (non-fatal)', e);
    return null;
  }
}
