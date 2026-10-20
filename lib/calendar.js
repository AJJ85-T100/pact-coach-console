/**
 * lib/calendar.js — the coach's Google Calendar, via the PACT engine as the
 * signed-in coach (it holds the Google credentials since the Railway bot was
 * retired). The engine works out which coach from their login, so no ids or
 * shared secrets are passed.
 *
 *   coachConnectUrl(returnTo)       "Connect Google Calendar" link, or null when Google isn't set up
 *   coachCalendarStatus()           { configured, connected, email, lastSyncedAt }
 *   disconnectCoachCalendar()       remove the connection
 *   sendCoachCalendarEvent(payload) a session booked or cancelled → the coach's diary
 *                                   (Google if connected, an emailed .ics if not)
 *
 * All non-fatal: scheduling must never fail because the diary write didn't land.
 */
import { engineFetch } from '@/lib/engine';

export async function coachConnectUrl(returnTo) {
  const { status, json } = await engineFetch('/v1/calendar/connect-url', { method: 'POST', body: JSON.stringify({ return: returnTo }) });
  return status === 200 && json?.configured ? json.url : null;
}

export async function coachCalendarStatus() {
  const { status, json } = await engineFetch('/v1/calendar/status');
  return status === 200 ? json : { connected: false, configured: false };
}

export async function disconnectCoachCalendar() {
  const { status } = await engineFetch('/v1/calendar/disconnect', { method: 'POST', body: '{}' });
  return status === 200;
}

// action: 'create' | 'cancel'. Returns { ok, method: 'google'|'ics'|'none', event_id? } or null.
export async function sendCoachCalendarEvent(payload) {
  const { status, json } = await engineFetch('/v1/coach/calendar/event', { method: 'POST', body: JSON.stringify(payload) });
  if (status !== 200) {
    console.warn('[calendar] engine event returned', status, json?.error);
    return null;
  }
  return json;
}
