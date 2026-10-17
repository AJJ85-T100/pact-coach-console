// ============================================================
// Today (coach home) — derivations
//
// Pure functions, no React. app/dashboard/page.js loads rows and these turn
// them into what the Today cards draw. Same rule as lib/athlete/overview.js:
// nothing here invents a number. A figure without the data behind it comes
// back null and the card says what's missing instead.
// ============================================================

import { slipBand, chatChannel } from '@/lib/athlete/overview';

const TZ = 'Europe/London';

/** YYYY-MM-DD for the London day containing d. */
export function londonKey(d = new Date()) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Shift a YYYY-MM-DD key by n days (noon anchor, so DST can't skip a day). */
export function addDaysKey(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function londonTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

const GONE = new Set(['churned', 'archived', 'inactive']);
/** On the roster: not archived (status 'churned' is what Archive sets). */
export const isActive = (c) => !GONE.has(String(c?.status || '').toLowerCase());

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Latest athlete_state_daily row per client (rows in any order). */
export function latestStateByClient(rows) {
  const by = {};
  (rows || []).forEach((r) => {
    if (!r?.client_id) return;
    if (!by[r.client_id] || String(r.date) > String(by[r.client_id].date)) by[r.client_id] = r;
  });
  return by;
}

/** Why an athlete is drifting, in a coach's words, from their state row. */
export function driftReason(state) {
  const bits = [];
  const a7 = num(state?.adherence_7d);
  const a28 = num(state?.adherence_28d);
  if (a7 != null && a28 != null && a7 < a28 - 0.05) bits.push(`Adherence ${Math.round(a28 * 100)}% → ${Math.round(a7 * 100)}% this week`);
  else if (a7 != null) bits.push(`Adherence ${Math.round(a7 * 100)}% this week`);
  const silent = num(state?.days_silent);
  if (silent != null && silent >= 2) bits.push(`Quiet for ${silent} days`);
  return bits.join(' · ') || null;
}

// ------------------------------------------------------------
// Roster today — bands from slip risk (the athlete page's definition)
// ------------------------------------------------------------
export function rosterBands(active, stateBy) {
  const out = { on_track: 0, watch: 0, drifting: 0, none: 0, total: active.length, drifting_list: [] };
  active.forEach((c) => {
    const b = slipBand(stateBy[c.id]);
    if (!b) { out.none += 1; return; }
    out[b.band] += 1;
    if (b.band === 'drifting') {
      out.drifting_list.push({ clientId: c.id, athlete: c.name || 'Athlete', score: b.score, reason: driftReason(stateBy[c.id]) });
    }
  });
  out.drifting_list.sort((a, b) => b.score - a.score);
  out.hasState = out.total > out.none;
  return out;
}

// ------------------------------------------------------------
// Revenue strip
// ------------------------------------------------------------
const CHURN_TS = ['churned_at', 'archived_at', 'ended_at', 'left_at'];

/**
 * @param clients   every clients row for this coach (select '*'), incl. archived
 * @param active    the active subset
 * @param drifting  rosterBands().drifting_list
 * @param pt        personal_trainers row (select '*')
 */
export function revenue({ clients, active, drifting, pt, todayKey }) {
  const has = (col) => clients.some((c) => Object.prototype.hasOwnProperty.call(c, col));
  const columns = {
    monthly_fee: has('monthly_fee'),
    renewal_date: has('renewal_date'),
    baseline: !!pt && Object.prototype.hasOwnProperty.call(pt, 'baseline_monthly_churn_pct'),
  };
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
  const fee = (c) => { const f = num(c?.monthly_fee); return f != null && f >= 0 ? f : null; };

  // ---- At risk: drifting athletes, by renewal in the next 14 days
  let atRisk = null;
  if (columns.monthly_fee) {
    const horizon = addDaysKey(todayKey, 14);
    const drift = drifting.map((d) => byId[d.clientId]).filter(Boolean);
    const renewing = drift.filter((c) => c.renewal_date && String(c.renewal_date).slice(0, 10) >= todayKey && String(c.renewal_date).slice(0, 10) <= horizon);
    const renewingWithFee = renewing.filter((c) => fee(c) != null);
    const driftWithFee = drift.filter((c) => fee(c) != null);
    atRisk = {
      renewingCount: renewing.length,
      renewingAmount: renewingWithFee.reduce((s, c) => s + fee(c), 0),
      renewingNoFee: renewing.length - renewingWithFee.length,
      driftingCount: drift.length,
      driftingAmount: driftWithFee.reduce((s, c) => s + fee(c), 0),
      driftingNoFee: drift.length - driftWithFee.length,
      anyRenewalDates: columns.renewal_date && active.some((c) => c.renewal_date),
      anyFees: active.some((c) => fee(c) != null),
      names: renewing.map((c) => ({ clientId: c.id, athlete: c.name || 'Athlete', fee: fee(c), renews: String(c.renewal_date).slice(0, 10) })),
    };
  }

  // ---- Kept vs baseline: only with a baseline, fees and a dated churn signal
  const baseline = columns.baseline ? num(pt.baseline_monthly_churn_pct) : null;
  const churnCol = CHURN_TS.find((col) => has(col)) || null;
  let kept = null;
  let keptMissing = [];
  if (baseline == null) keptMissing.push('baseline');
  if (!columns.monthly_fee || !active.some((c) => fee(c) != null)) keptMissing.push('fees');
  if (!churnCol) keptMissing.push('churn_date');

  if (!keptMissing.length) {
    const monthStart = `${todayKey.slice(0, 8)}01`;
    const startKey = (c) => String(c.created_at || c.start_date || '').slice(0, 10) || null;
    const leftKey = (c) => (c[churnCol] ? londonKey(c[churnCol]) : null);
    const atStart = clients.filter((c) => {
      const s = startKey(c);
      if (!s || s >= monthStart) return false;
      const l = leftKey(c);
      if (l) return l >= monthStart;
      return isActive(c); // archived with no date: can't place it, leave it out
    });
    const leftThisMonth = atStart.filter((c) => { const l = leftKey(c); return l && l >= monthStart; });
    const fees = atStart.map(fee).filter((f) => f != null);
    if (atStart.length >= 5 && fees.length >= Math.ceil(atStart.length / 2)) {
      const avgFee = fees.reduce((s, f) => s + f, 0) / fees.length;
      const actualPct = (leftThisMonth.length / atStart.length) * 100;
      kept = {
        amount: ((baseline - actualPct) / 100) * atStart.length * avgFee,
        baselinePct: baseline,
        actualPct,
        atStart: atStart.length,
        left: leftThisMonth.length,
        avgFee,
      };
    } else {
      keptMissing.push('volume');
    }
  }

  return { columns, atRisk, kept, keptMissing, baseline };
}

// ------------------------------------------------------------
// PAX today
// ------------------------------------------------------------
const SENT = new Set(['sent', 'delivered']);

/**
 * @param ivs      interventions rows from the last ~26 h (this coach's roster)
 * @param labels   coach_labels rows from the last ~26 h (this coach)
 */
export function paxToday({ ivs, labels, todayKey }) {
  const today = (ivs || []).filter((r) => londonKey(r.occurred_at) === todayKey);
  const labelledToday = (labels || []).filter((l) => londonKey(l.created_at) === todayKey);
  const coachSent = new Set(labelledToday.filter((l) => l.label === 'approved' || l.label === 'edited').map((l) => l.intervention_id));
  const decided = new Set(
    labelledToday
      .filter((l) => (l.label === 'approved' || l.label === 'edited' || l.label === 'rejected') && l.edit_text !== 'expired')
      .map((l) => l.intervention_id),
  );

  const auto = today
    .filter((r) => r.initiated_by === 'engine' && SENT.has(r.delivery_status) && r.type !== 'escalation' && !coachSent.has(r.id))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const drafted = new Set([...today.filter((r) => r.delivery_status === 'draft').map((r) => r.id), ...decided]);
  const escalated = today.filter((r) => r.type === 'escalation').length;
  return { auto, sentOwn: auto.length, drafted: drafted.size, escalated };
}

/**
 * What PAX sent on its own today, grouped by angle (chat replies together).
 * Returns plain rows; the screen maps angle → engine label.
 */
export function groupAutoLog(auto, nameBy) {
  const groups = new Map();
  auto.forEach((r) => {
    const angle = r.type === 'reply' ? null : (Array.isArray(r.decision?.angles) && r.decision.angles[0]) || null;
    const key = r.type === 'reply' ? 'reply' : angle ? `a:${angle}` : `t:${r.type}`;
    if (!groups.has(key)) groups.set(key, { key, angle, type: r.type, first: r.occurred_at, last: r.occurred_at, count: 0, athletes: [] });
    const g = groups.get(key);
    g.count += 1;
    g.last = r.occurred_at;
    const nm = nameBy[r.client_id];
    if (nm && !g.athletes.some((a) => a.clientId === r.client_id)) g.athletes.push({ clientId: r.client_id, athlete: nm });
  });
  return [...groups.values()]
    .sort((a, b) => a.first.localeCompare(b.first))
    .map((g) => ({ ...g, from: londonTime(g.first), to: londonTime(g.last) }));
}

// ------------------------------------------------------------
// Athletes replying — 4 h reply rate, last 7 days
// ------------------------------------------------------------
/** rows: [{ replied, occurred_at, type }] — resolved 4 h outcomes. */
export function replyDays(rows, todayKey) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDaysKey(todayKey, -i);
    days.push({ key, label: new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), n: 0, yes: 0 });
  }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  (rows || []).forEach((r) => {
    if (r.type === 'reply' || r.type === 'escalation') return;
    const d = byKey[londonKey(r.occurred_at)];
    if (!d) return;
    d.n += 1;
    if (r.replied) d.yes += 1;
  });
  const n = days.reduce((s, d) => s + d.n, 0);
  const yes = days.reduce((s, d) => s + d.yes, 0);
  return {
    days: days.map((d) => ({ key: d.key, label: d.label, v: d.n ? Math.round((d.yes / d.n) * 100) : null, n: d.n })),
    overall: n ? Math.round((yes / n) * 100) : null,
    n,
  };
}

// ------------------------------------------------------------
// Onboarding funnel
// ------------------------------------------------------------
/**
 * @param active       active clients rows
 * @param openInvites  unused, unexpired invite_tokens rows
 * @param roster       engine /v1/coach/roster athletes (or null)
 * @param consentRows  consents rows (fallback when the engine is down)
 * @param loggedIds    Set of client ids with any log
 */
export function onboardingFunnel({ active, openInvites, roster, consentRows, loggedIds }) {
  const rosterBy = Object.fromEntries((roster || []).map((a) => [a.clientId, a]));
  const has = (id, p) => (consentRows || []).some((r) => r.client_id === id && r.purpose === p && !r.withdrawn_at);
  const consented = (c) => (rosterBy[c.id] ? !!rosterBy[c.id].consented : has(c.id, 'coaching') && has(c.id, 'processing'));
  const connected = (c) => !!(rosterBy[c.id]?.app || rosterBy[c.id]?.chat || chatChannel(c));
  const person = (c) => ({ clientId: c.id, athlete: c.name || 'Athlete' });

  const s1 = active;
  const s2 = s1.filter(consented);
  const s3 = s2.filter(connected);
  const s4 = s3.filter((c) => loggedIds.has(c.id));
  const invites = (openInvites || []).map((i) => ({ clientId: null, athlete: `${i.client_name || 'Unnamed'} (invite not used yet)` }));

  return {
    stages: [
      { key: 'invited', label: 'Invited', count: s1.length + invites.length, stuck: [] },
      { key: 'consented', label: 'Consented', count: s2.length, stuck: [...invites, ...s1.filter((c) => !consented(c)).map(person)], stuckWhy: 'Waiting on consent' },
      { key: 'connected', label: 'App or chat connected', count: s3.length, stuck: s2.filter((c) => !connected(c)).map(person), stuckWhy: 'No app or chat yet' },
      { key: 'logged', label: 'First log', count: s4.length, stuck: s3.filter((c) => !loggedIds.has(c.id)).map(person), stuckWhy: 'Nothing logged yet' },
    ],
    usedEngine: !!roster,
  };
}
