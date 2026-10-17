// ============================================================
// Athlete page — Overview tab derivations
//
// Pure functions, no React. The page loads rows server-side and these turn
// them into what the Overview cards draw. Nothing here invents a number:
// a metric without real data (or without a target) returns null and the
// card leaves that row out.
// ============================================================

import { addDays, dayKey, fmtNum, mean } from '@/lib/athlete/metrics';

export const BRAND = {
  blue: '#0A2540',
  red: '#D92D20',
  redInk: '#B42318',
  green: '#1B6E3A',
  amber: '#B54708',
  grey: '#C9D3E0',
  muted: '#5B6B7F',
};

const TZ = 'Europe/London';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday (local) of the week containing d. */
export function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function listDays(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const kFmt = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmtNum(v));

// ------------------------------------------------------------
// Header
// ------------------------------------------------------------

/** Week N of M for the active programme, when its dates allow it. */
export function programmeWeek(programmes, today = new Date()) {
  const p = (programmes || []).find((x) => x.status === 'active' && x.start_date) || null;
  if (!p) return null;
  const start = new Date(p.start_date);
  if (Number.isNaN(start.getTime())) return null;
  const week = Math.floor((today.getTime() - start.getTime()) / (7 * 86400000)) + 1;
  if (week < 1) return { label: `${p.name || 'Programme'} starts ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` };
  if (p.weeks && week > p.weeks) return null;
  return { label: p.weeks ? `Week ${week} of ${p.weeks}` : `Week ${week}` };
}

/** The ONE risk source: slip_risk on the latest athlete_state_daily row. */
export function slipTag(state) {
  if (!state || state.slip_risk == null) return null;
  const score = Math.round(Number(state.slip_risk) * 100);
  if (!Number.isFinite(score)) return null;
  if (score >= 60) return { text: `Drifting · slip risk ${score}`, color: BRAND.redInk };
  if (score >= 35) return { text: `Watch · slip risk ${score}`, color: BRAND.amber };
  return { text: `On track · slip risk ${score}`, color: BRAND.green };
}

export function consentTag(consents) {
  if (!Array.isArray(consents)) return null;
  const has = (p) => consents.some((r) => r.purpose === p && !r.withdrawn_at);
  const withdrawn = consents.some((r) => (r.purpose === 'coaching' || r.purpose === 'processing') && r.withdrawn_at)
    && !(has('coaching') && has('processing'));
  if (has('coaching') && has('processing')) return { text: 'Consent given', color: BRAND.green };
  if (withdrawn) return { text: 'Consent withdrawn', color: BRAND.redInk };
  return { text: 'Consent needed', color: BRAND.amber };
}

/** Same rule the engine uses to pick a chat channel (push/notify.ts chatChannel). */
export function chatChannel(client) {
  if (!client) return null;
  if (client.channel === 'telegram' && client.telegram_user_id) return 'telegram';
  if (client.channel === 'whatsapp' && client.wa_phone) return 'whatsapp';
  if (client.wa_phone) return 'whatsapp';
  if (client.telegram_user_id) return 'telegram';
  return null;
}

export function channelTag(client, hasApp) {
  const chat = chatChannel(client);
  const chatName = chat === 'telegram' ? 'Telegram' : chat === 'whatsapp' ? 'WhatsApp' : null;
  const parts = [hasApp ? 'App' : null, chatName].filter(Boolean);
  if (!parts.length) return { text: 'No channel connected', color: BRAND.muted };
  return { text: parts.join(' + '), color: BRAND.blue };
}

// ------------------------------------------------------------
// This week vs targets
// ------------------------------------------------------------

/**
 * @param series      dense day series from the page (oldest → newest)
 * @param planRows    programme rows (date, is_rest, completed, session_name)
 * @param client      clients row (training_days, *_target)
 * @param targets     resolved targets { steps, protein, sleep }
 */
export function weekTargets({ series, planRows, client, targets, today = new Date() }) {
  const mon = mondayOf(today);
  const todayKey = dayKey(today);
  const byKey = Object.fromEntries((series || []).map((d) => [d.date, d]));
  const week = WEEKDAYS.map((label, i) => {
    const d = addDays(mon, i);
    const key = dayKey(d);
    return { label, key, row: byKey[key] || null, past: key < todayKey, isToday: key === todayKey, future: key > todayKey };
  });
  const upToToday = week.filter((d) => !d.future);
  const rows = [];

  // Sessions — the programme plan first, the athlete's stated days if there's no plan.
  const plan = {};
  (planRows || []).forEach((p) => { if (p.date && !p.is_rest) plan[p.date] = p; });
  const statedDays = Array.isArray(client?.training_days) ? client.training_days : [];
  const hasPlanThisWeek = week.some((d) => plan[d.key]);
  const planned = (d) => (hasPlanThisWeek ? !!plan[d.key] : statedDays.includes(d.label));
  const done = (d) => !!(d.row?.trained || plan[d.key]?.completed);
  const plannedCount = week.filter(planned).length;
  if (plannedCount > 0) {
    const doneCount = week.filter(done).length;
    const missed = week.filter((d) => planned(d) && d.past && !done(d));
    const extra = week.filter((d) => !planned(d) && done(d));
    const days = week.map((d) => {
      if (done(d)) return { label: d.label, v: planned(d) ? 'Done' : 'Extra', h: 100, c: BRAND.blue };
      if (planned(d) && d.past) return { label: d.label, v: 'Missed', h: 8, c: BRAND.red };
      if (planned(d) && d.isToday) return { label: d.label, v: 'Today', h: 4, c: BRAND.grey };
      if (planned(d)) return { label: d.label, v: 'Planned', h: 4, c: BRAND.grey };
      return { label: d.label, v: '', h: 0, c: BRAND.grey };
    });
    const plannedNames = week.filter(planned).map((d) => d.label);
    const bits = [`Planned ${listDays(plannedNames)}.`];
    if (missed.length) bits.push(`Missed ${listDays(missed.map((d) => d.label))}.`);
    if (extra.length) bits.push(`Extra on ${listDays(extra.map((d) => d.label))}.`);
    if (!missed.length && !extra.length && doneCount) bits.push('Nothing missed so far.');
    const pct = Math.min(100, Math.round((doneCount / plannedCount) * 100));
    const behind = missed.length > 0;
    rows.push({
      key: 'sessions', name: 'Sessions', value: String(doneCount), of: `of ${plannedCount}`, pct,
      color: behind ? BRAND.red : BRAND.blue, note: bits.join(' '), days,
    });
  }

  // Daily averages against a target: protein, steps.
  const avgRow = (key, name, unit, target, fmt) => {
    if (!target) return null;
    const logged = upToToday.filter((d) => d.row && d.row[key] != null);
    if (!logged.length) return null;
    const avg = mean(logged.map((d) => Number(d.row[key])));
    const pct = Math.min(100, Math.round((avg / target) * 100));
    const days = week.map((d) => {
      const v = d.row?.[key];
      if (v == null || d.future) return { label: d.label, v: '', h: 0, c: BRAND.grey };
      const r = Number(v) / target;
      return { label: d.label, v: fmt(Number(v)), h: Math.max(4, Math.min(100, Math.round(r * 100))), c: r < 0.75 ? BRAND.red : BRAND.blue };
    });
    const low = logged.reduce((a, b) => (Number(b.row[key]) < Number(a.row[key]) ? b : a));
    const gaps = upToToday.filter((d) => d.past && (d.row?.[key] == null)).length;
    const note = [
      `${logged.length} day${logged.length === 1 ? '' : 's'} logged.`,
      logged.length > 1 ? `Lowest ${low.label}: ${fmt(Number(low.row[key]))}.` : null,
      gaps ? `${gaps} day${gaps === 1 ? '' : 's'} with nothing logged.` : null,
    ].filter(Boolean).join(' ');
    return {
      key, name, value: fmtNum(avg), of: `of ${fmtNum(target)}${unit}`, pct,
      color: pct < 75 ? BRAND.red : BRAND.blue, note, days,
    };
  };
  const protein = avgRow('protein', 'Protein, daily avg', ' g', targets.protein, (v) => `${fmtNum(v)} g`);
  if (protein) rows.push(protein);
  const steps = avgRow('steps', 'Steps, daily avg', '', targets.steps, kFmt);
  if (steps) rows.push(steps);

  // Sleep — nights at or near the sleep target, out of nights with a reading.
  if (targets.sleep) {
    const nights = upToToday.filter((d) => d.row && d.row.sleep != null);
    if (nights.length) {
      const kept = (v) => Number(v) >= targets.sleep * 0.95;
      const keptCount = nights.filter((d) => kept(d.row.sleep)).length;
      const short = nights.filter((d) => !kept(d.row.sleep));
      const days = week.map((d) => {
        const v = d.row?.sleep;
        if (v == null || d.future) return { label: d.label, v: '', h: 0, c: BRAND.grey };
        const ok = kept(v);
        return { label: d.label, v: `${fmtNum(Number(v), 1)}h`, h: Math.max(8, Math.min(100, Math.round((Number(v) / targets.sleep) * 100))), c: ok ? BRAND.blue : BRAND.red };
      });
      const pct = Math.round((keptCount / nights.length) * 100);
      rows.push({
        key: 'sleep', name: `Sleep, ${fmtNum(targets.sleep, 1)}h+ nights`, value: String(keptCount), of: `of ${nights.length} night${nights.length === 1 ? '' : 's'}`, pct,
        color: pct < 75 ? BRAND.red : BRAND.blue,
        note: short.length ? `Short on ${listDays(short.map((d) => `${d.label} (${fmtNum(Number(d.row.sleep), 1)}h)`))}.` : 'Every night with a reading hit the target.',
        days,
      });
    }
  }

  const todayName = today.toLocaleDateString('en-GB', { weekday: 'long' });
  return { rows, soFar: todayName === 'Sunday' ? 'Mon–Sun' : `Mon–Sun, ${todayName} so far` };
}

// ------------------------------------------------------------
// What PAX has done
// ------------------------------------------------------------

const TYPE_COPY = {
  morning: 'Morning brief',
  midday: 'Midday check-in',
  evening: 'Evening wrap',
  slip_checkin: 'Slip check-in',
  nudge: 'Nudge',
  milestone: 'Milestone',
  coach_message: 'Your message',
  weekly_report: 'Weekly wrap',
  reply: 'Chat reply',
};

export function whenLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const k = (x) => x.toLocaleDateString('en-CA', { timeZone: TZ });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
  if (k(d) === k(now)) return `Today ${time}`;
  if (k(d) === k(new Date(now.getTime() - 86400000))) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: TZ })} ${time}`;
}

function clip(text, n) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function latency(s) {
  if (s == null) return null;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.round(s / 3600);
  return `${h} h`;
}

/**
 * Timeline rows from interventions (+ outcomes + coach labels + the message
 * text they point at). Falls back to recent PAX messages when there's no V2
 * history for this athlete.
 */
export function paxTimeline({ interventions, outcomes, labels, convById, userMsgs, fallbackMsgs, coachFirstName, now = new Date() }) {
  const ivs = (interventions || []).filter(
    (r) => ['sent', 'delivered'].includes(r.delivery_status) && r.type !== 'escalation' && r.type !== 'reply',
  );
  const replies = (interventions || []).filter((r) => r.type === 'reply' && ['sent', 'delivered'].includes(r.delivery_status)).length;

  if (!ivs.length) {
    const rows = (fallbackMsgs || []).slice(0, 6).map((m, i) => ({
      id: `m${i}`,
      when: whenLabel(m.created_at, now),
      tag: { text: m.sender === 'coach' ? 'Coach-sent' : 'PAX', color: m.sender === 'coach' ? BRAND.blue : BRAND.muted },
      summary: clip(m.content, 110),
      outcome: null,
    }));
    return { rows, total: rows.length, replies: 0, source: 'messages' };
  }

  const outBy = {};
  (outcomes || []).forEach((o) => { (outBy[o.intervention_id] ||= {})[o.horizon] = o; });
  const labelBy = {};
  (labels || []).forEach((l) => { if (!labelBy[l.intervention_id]) labelBy[l.intervention_id] = l; });
  const userAsc = [...(userMsgs || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const who = coachFirstName || 'you';

  const rows = ivs.slice(0, 8).map((r) => {
    const lab = labelBy[r.id];
    let tag = { text: 'Auto', color: BRAND.muted };
    if (r.initiated_by === 'coach' || r.type === 'coach_message') tag = { text: 'Coach-sent', color: BRAND.blue };
    else if (lab?.label === 'approved') tag = { text: `Approved by ${who}`, color: BRAND.blue };
    else if (lab?.label === 'edited') tag = { text: `Edited by ${who}`, color: BRAND.blue };

    const text = convById?.[r.message_ref]?.content;
    const kind = TYPE_COPY[r.type] || 'Message';
    const summary = text ? `${kind}: ${clip(text, 100)}` : kind;

    const o = outBy[r.id] || {};
    const sentAt = Date.parse(r.occurred_at);
    const reply = userAsc.find((m) => {
      const t = Date.parse(m.created_at);
      return t > sentAt && t - sentAt < 24 * 3600e3;
    });
    let outcome = null;
    const trained = o['24h']?.status === 'resolved' && (o['24h'].trained || o['24h'].logged_session);
    if (trained) {
      outcome = { text: 'Outcome: session logged within 24 h', good: true };
    } else if (reply) {
      const lat = latency(o['4h']?.reply_latency_s ?? Math.round((Date.parse(reply.created_at) - sentAt) / 1000));
      outcome = { text: `Replied after ${lat}: “${clip(reply.content, 60)}”`, good: false };
    } else if (o['4h']?.status === 'resolved' && o['4h'].replied === false) {
      outcome = { text: 'No reply within 4 h', good: false };
    } else if (now.getTime() - sentAt < 24 * 3600e3) {
      outcome = { text: 'No reply yet', good: false };
    } else {
      outcome = { text: 'No reply', good: false };
    }
    return { id: r.id, when: whenLabel(r.occurred_at, now), tag, summary, outcome };
  });
  return { rows, total: ivs.length, replies, source: 'interventions' };
}

// ------------------------------------------------------------
// Trend
// ------------------------------------------------------------

/**
 * Weekly session adherence, last 8 weeks (Mon-start), oldest → newest.
 * Programme plan + completions first; athlete_state_daily.adherence_7d at
 * each week's end as the fallback. null where nothing was planned.
 */
export function weeklyAdherence({ planRows, workoutDays, stateRows, today = new Date() }) {
  const thisMon = mondayOf(today);
  const todayKey = dayKey(today);
  const plan = (planRows || []).filter((p) => p.date && !p.is_rest);
  const trainedOn = new Set(workoutDays || []);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const mon = addDays(thisMon, -7 * i);
    const from = dayKey(mon);
    const to = dayKey(addDays(mon, 6));
    const label = `${mon.getDate()}/${mon.getMonth() + 1}`;
    const rows = plan.filter((p) => p.date >= from && p.date <= to && (p.date < todayKey || p.completed || trainedOn.has(p.date)));
    let v = null;
    if (rows.length) {
      const done = rows.filter((p) => p.completed || trainedOn.has(p.date)).length;
      v = Math.round((done / rows.length) * 100);
    } else {
      const s = (stateRows || []).filter((r) => r.date >= from && r.date <= to && r.adherence_7d != null)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (s) v = Math.round(Number(s.adherence_7d) * 100);
    }
    weeks.push({ label, from, v });
  }
  return weeks;
}

export function trendStats(stateRows) {
  const rows = [...(stateRows || [])].sort((a, b) => b.date.localeCompare(a.date));
  const latest = rows[0] || null;
  if (!latest) return null;
  const pct = (x) => (x == null ? null : Math.round(Number(x) * 100));
  const a7 = pct(latest.adherence_7d);
  const a28 = pct(latest.adherence_28d);
  const best = rows.reduce((m, r) => (r.logging_streak != null && r.logging_streak > m ? r.logging_streak : m), 0);
  let lastActive = null;
  if (latest.days_silent != null) {
    const d = new Date(`${latest.date}T12:00:00`);
    d.setDate(d.getDate() - Number(latest.days_silent));
    lastActive = latest.days_silent === 0 ? 'active that day' : `last active ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return {
    asOf: new Date(`${latest.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    adherence: a7,
    adherenceSub: a28 == null ? null : a7 == null ? `28-day: ${a28}%` : a7 < a28 - 5 ? `down from ${a28}% (28-day)` : a7 > a28 + 5 ? `up from ${a28}% (28-day)` : `28-day: ${a28}%`,
    adherenceDown: a7 != null && a28 != null && a7 < a28 - 5,
    daysSilent: latest.days_silent,
    silentSub: lastActive,
    streak: latest.logging_streak,
    streakSub: best > 0 ? `best: ${best} day${best === 1 ? '' : 's'}` : null,
  };
}

// ------------------------------------------------------------
// PAX rules
// ------------------------------------------------------------

export const APPROVAL_COPY = {
  auto: 'Sends on schedule · you see everything',
  review_nudges: 'Morning and evening auto · midday held for you',
  review_all: 'Everything held for your approval',
};
