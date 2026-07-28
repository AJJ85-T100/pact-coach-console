// ============================================================
// Athlete card — shared metric derivation
//
// Pure functions, no React, no 'use client'. Imported by both the
// server component (app/dashboard/clients/[id]/page.js) and the
// client chart components, so a figure in the header and the same
// figure in a tooltip can never disagree.
//
// Spec: claude/PACT_Athlete_Card_Visual_Spec.md
// ============================================================

/** PACT brand palette, per the styling brief + the dataviz validator run.
 *  Status colours are ALWAYS paired with a glyph and a word — red/green sit
 *  at deutan ΔE 7.5, inside the band where colour alone is not sufficient. */
export const PALETTE = {
  ink:        '#0A2540',   // Commitment Blue
  ink2:       '#4A4A4A',
  muted:      '#8A95A3',
  surface:    '#FFFFFF',
  page:       '#F4F6F8',
  grid:       '#E2E6EB',
  baseline:   '#C9D2DC',
  series:     '#0A2540',
  seriesSoft: '#93AEC9',
  seriesWash: 'rgba(10,37,64,0.07)',
  reference:  '#8A95A3',
  accent:     '#D92D20',   // Drive Red
  good:       '#0F8A4D',
  goodWash:   '#E7F3EC',
  warn:       '#E8A33D',
  warnInk:    '#8A5A0B',
  warnWash:   '#FCF2E2',
  crit:       '#D92D20',
  critWash:   '#FBE9E7',
  none:       '#EDF0F4',
};

export const GLYPH = { good: '✓', warn: '~', crit: '✕', rest: '·', none: '·' };
export const WORD  = { good: 'On target', warn: 'Off target', crit: 'Well off', rest: 'Rest day', none: 'No data' };

export const DAY_MS = 86400000;

/** Local-date key (en-CA gives YYYY-MM-DD), matching how the rest of the
 *  console buckets days. Deliberately NOT toISOString — that shifts the
 *  weekday for anyone west of UTC (Master Backlog 4.10 #8). */
export const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function mean(arr) {
  const v = (arr || []).filter((x) => x != null && !isNaN(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

// ------------------------------------------------------------
// Plausibility guard
//
// A weigh-in is suspect if it is outside human range, or moves faster
// than physiology allows since the last good reading. This exists because
// a single bad row — 15 stone typed into a kg field — otherwise poisons
// current weight, "lost" and "to go" simultaneously, and the card renders
// all three with total confidence.
// ------------------------------------------------------------
export const PLAUSIBLE = { min: 35, max: 250, maxJumpPerDay: 1.2 };

/** @param rows weigh_ins ASCENDING by date. Returns the same rows with `suspect`. */
export function flagWeighIns(rows) {
  let lastGood = null;
  return (rows || [])
    .filter((r) => r && r.weight != null)
    .map((r) => {
      const when = new Date(r.date || r.created_at);
      let bad = r.weight < PLAUSIBLE.min || r.weight > PLAUSIBLE.max;
      if (!bad && lastGood) {
        const gapDays = Math.max(1, (when - lastGood.when) / DAY_MS);
        if (Math.abs(r.weight - lastGood.weight) / gapDays > PLAUSIBLE.maxJumpPerDay) bad = true;
      }
      const out = { ...r, when, key: dayKey(when), suspect: bad };
      if (!bad) lastGood = out;
      return out;
    });
}

/** 7-day moving average over clean readings only. */
export function weightTrend(cleanRows, windowDays = 7) {
  return cleanRows.map((w) => {
    const from = w.when.getTime() - (windowDays - 1) * DAY_MS;
    const win = cleanRows.filter((x) => x.when.getTime() <= w.when.getTime() && x.when.getTime() >= from);
    return { when: w.when, key: w.key, v: +(mean(win.map((x) => x.weight))).toFixed(2) };
  });
}

/**
 * Everything the Journey section needs, derived once.
 * `currentWeight` is the END OF THE TREND, never the latest raw reading.
 */
export function deriveJourney(weighRows, client) {
  const all = flagWeighIns(weighRows);
  const clean = all.filter((w) => !w.suspect);
  const flagged = all.filter((w) => w.suspect);
  const trend = weightTrend(clean);

  const start  = client?.start_weight ?? null;
  const target = client?.target_weight ?? null;
  // Fall back to clients.current_weight only when there is no usable history at all.
  const current = trend.length ? trend[trend.length - 1].v
                : (client?.current_weight ?? null);

  const lost = start != null && current != null ? +(start - current).toFixed(1) : null;
  const toGo = current != null && target != null ? +(current - target).toFixed(1) : null;

  // Pace across the last 8 weeks of trend
  const cutoff = Date.now() - 56 * DAY_MS;
  const recent = trend.filter((t) => t.when.getTime() >= cutoff);
  let paceKgPerWeek = null;
  if (recent.length > 1) {
    const spanDays = (recent[recent.length - 1].when - recent[0].when) / DAY_MS;
    if (spanDays >= 7) paceKgPerWeek = +(((recent[0].v - recent[recent.length - 1].v) / spanDays) * 7).toFixed(2);
  }
  const etaWeeks = paceKgPerWeek && paceKgPerWeek > 0.02 && toGo > 0
    ? Math.ceil(toGo / paceKgPerWeek) : null;

  return {
    all, clean, flagged, trend,
    start, target, current, lost, toGo, paceKgPerWeek, etaWeeks,
    lastCleanAt: clean.length ? clean[clean.length - 1].when : null,
  };
}

// ------------------------------------------------------------
// Coverage guard
//
// An average built from fewer than MIN_COVER of 7 days is not an average.
// Without this the card states a sleep trend from a single night whenever
// a wearable drops out.
// ------------------------------------------------------------
export const MIN_COVER = 4;

export function windowStats(daysDesc, key, days) {
  const slice = daysDesc.slice(0, days);
  const vals = slice.map((d) => d[key]).filter((v) => v != null);
  return { avg: mean(vals), covered: vals.length, of: slice.length || days };
}

/** Status of a value against a target. `dir`: 'more' (one-sided) | 'band' (two-sided). */
export function statusFor(value, target, dir = 'more') {
  if (value == null || !target) return null;
  const r = value / target;
  if (dir === 'band') return r >= 0.9 && r <= 1.1 ? 'good' : (r >= 0.75 && r <= 1.25 ? 'warn' : 'crit');
  return r >= 0.95 ? 'good' : (r >= 0.75 ? 'warn' : 'crit');
}

/** Build a dense day-by-day series (oldest → newest) from sparse rows. */
export function densify(rows, days, getKey, build) {
  const byKey = {};
  (rows || []).forEach((r) => {
    const k = getKey(r);
    if (k && !byKey[k]) byKey[k] = r;   // rows arrive newest-first; keep the newest per day
  });
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dayKey(d);
    out.push(build(byKey[k] || null, d, k));
  }
  return out;
}

export const fmtNum = (v, d = 0) =>
  v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

export const shortDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const shortDateY = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
