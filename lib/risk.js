/**
 * lib/risk.js — the ONE definition of athlete risk.
 *
 * Every surface (roster cards, at-risk board, reports) must read risk through
 * these functions so an athlete never looks "watch" on one screen and "high
 * risk" on another. The inputs are cheap aggregates any screen already has:
 *   - daysSilent:   days since the athlete last messaged PAX (null = never)
 *   - adherencePct: pact adherence % over the window (null = no data)
 *   - daysLogged:   days with any pact entry in the window
 */

// 0-100 risk score: weighted blend of silence and low adherence. No model
// call — pure arithmetic. (Moved verbatim from /api/reports/roster.)
export function riskScore({ daysSilent, adherencePct, daysLogged }) {
  const ds = daysSilent == null ? 21 : daysSilent;
  let s = Math.min(55, (ds / 14) * 55);
  s += ((100 - (adherencePct == null ? 0 : adherencePct)) / 100) * 35;
  if (!daysLogged) s += 10;
  return Math.round(Math.min(100, Math.max(0, s)));
}

// Weekly status band used by reports + summary counts.
export function statusOf({ adherencePct, daysLogged }) {
  if (daysLogged === 0 || adherencePct == null) return 'at_risk';
  if (adherencePct < 30) return 'at_risk';
  if (adherencePct < 55) return 'watch';
  if (adherencePct < 80) return 'on_track';
  return 'strong';
}

// Score → tier. Same thresholds the at-risk board renders (70 / 45).
export function riskTier(score) {
  if (score == null) return 'medium';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}
