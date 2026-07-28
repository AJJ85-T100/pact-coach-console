'use client';

// ============================================================
// Trends — replaces the Rolling averages table.
//
// The old card printed 7-day beside 28-day and left the coach to do
// six subtractions. The delta IS the insight, so it's a chip, and the
// rows sort by movement so the thing that moved is at the top.
//
// Coverage guard: an average built from fewer than MIN_COVER of 7 days
// is not an average. Without it the card asserts a sleep trend from a
// single night whenever a wearable drops out.
// ============================================================

import { PALETTE, MIN_COVER, fmtNum, mean } from '@/lib/athlete/metrics';
import { Sparkline, Delta } from './ChartBits';

const DEFS = [
  { k: 'steps',    label: 'Steps',    fmt: (v) => fmtNum(v),          good: 'up'   },
  { k: 'calories', label: 'Calories', fmt: (v) => fmtNum(v),          good: 'band' },
  { k: 'protein',  label: 'Protein',  fmt: (v) => `${fmtNum(v)}g`,    good: 'up'   },
  { k: 'carbs',    label: 'Carbs',    fmt: (v) => `${fmtNum(v)}g`,    good: 'band' },
  { k: 'fat',      label: 'Fat',      fmt: (v) => `${fmtNum(v)}g`,    good: 'band' },
  { k: 'sleep',    label: 'Sleep',    fmt: (v) => `${fmtNum(v, 1)}h`, good: 'up'   },
];

export default function TrendRows({ series, targets, sourceNotes = {} }) {
  const last7 = series.slice(-7);
  const last28 = series.slice(-28);

  const rows = DEFS.map((d) => {
    const v7 = last7.map((x) => x[d.k]).filter((v) => v != null);
    const v28 = last28.map((x) => x[d.k]).filter((v) => v != null);
    const a7 = mean(v7), a28 = mean(v28);
    const thin = v7.length < MIN_COVER;
    const pct = !thin && a7 != null && a28 ? ((a7 - a28) / a28) * 100 : null;
    return { ...d, a7, a28, c7: v7.length, thin, pct, target: targets[d.k] || null,
             mag: pct == null ? -1 : Math.abs(pct) };
  }).sort((a, b) => b.mag - a.mag);

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-[9px] font-semibold tracking-[0.13em] uppercase text-muted">
          <th className="text-left pb-2.5">Metric</th>
          <th className="text-left pb-2.5 pl-4">Last 28 days</th>
          <th className="text-right pb-2.5">7-day avg</th>
          <th className="text-right pb-2.5">vs 28-day</th>
          <th className="text-right pb-2.5">Target</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const towardGoal = r.pct == null ? false : r.good === 'up'
            ? r.pct > 0
            : (r.target ? Math.abs((r.a7 - r.target) / r.target) < Math.abs((r.a28 - r.target) / r.target) : r.pct > 0);
          return (
            <tr key={r.k} className="border-t border-border">
              <td className="py-2.5 text-[13px] font-semibold text-blue align-middle">
                {r.label}
                {r.thin && (
                  <span className="block text-[11px] font-normal text-muted">
                    {sourceNotes[r.k] || 'not enough logs'}
                  </span>
                )}
              </td>
              <td className="py-2.5 px-4 align-middle w-[42%]">
                <Sparkline values={last28.map((x) => x[r.k])} target={r.target} />
              </td>
              <td className="py-2.5 text-right align-middle">
                {r.thin ? (
                  <span className="text-[13px] font-semibold" style={{ color: PALETTE.muted }}>too few logs</span>
                ) : (
                  <span className="font-display font-extrabold text-[17px] text-blue tabular-nums">
                    {r.a7 == null ? '—' : r.fmt(Math.round(r.a7 * 10) / 10)}
                  </span>
                )}
              </td>
              <td className="py-2.5 text-right align-middle">
                {r.thin ? <Delta label={`· ${r.c7}/7 days`} />
                        : r.pct == null ? <Delta label="· no data" />
                        : <Delta pct={r.pct} towardGoal={towardGoal} />}
              </td>
              <td className="py-2.5 text-right align-middle text-[11.5px] text-muted tabular-nums">
                {r.target ? r.fmt(r.target) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
