/**
 * The ONE "does this athlete need me?" answer in the console: the engine's
 * roster card status (engine domain/roster.ts), worked out from open
 * escalations, consent, last activity, the going-quiet read, missed sessions
 * and this week's targets. The roster, My Day, the athlete header and the
 * sidebar badge all read it from here, so no two screens can disagree.
 *
 * (Before Oct 23 there were four: clients.status, V1 daily pacts, a
 * slip-risk band and this one.)
 */
import { engineFetch } from '@/lib/engine';

export const STATUS = {
  need:  { label: 'Needs you',   color: '#B42318' },
  drift: { label: 'Drifting',    color: '#8A5A00' },
  ok:    { label: 'On track',    color: '#0B5E43' },
  new:   { label: 'Not started', color: '#4A5A6A' },
};

/** Every roster card for the signed-in coach, most urgent first; null if the engine can't be reached. */
export async function rosterCards() {
  const { status, json } = await engineFetch('/v1/coach/roster-cards');
  if (status !== 200 || !Array.isArray(json?.cards)) return null;
  return { cards: json.cards, today: json.today || null };
}

/** { need, drift, ok, new } counts. */
export function statusCounts(cards) {
  const out = { need: 0, drift: 0, ok: 0, new: 0 };
  for (const c of cards || []) if (out[c.status] != null) out[c.status] += 1;
  return out;
}

/** The athlete-page header tag for one card: "Drifting · Missed the last 2 sessions". */
export function statusTag(card) {
  if (!card) return null;
  const st = STATUS[card.status];
  if (!st) return null;
  return { text: card.status === 'ok' ? st.label : `${st.label} · ${card.why}`, color: st.color };
}
