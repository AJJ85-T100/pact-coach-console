'use client';

// ============================================================
// Strength — small multiples, one chart per lift.
//
// Not four lines on one axis: a four-series categorical palette does
// not clear the CVD floors at slot four in our validated palette, and
// faceting reads better anyway — a coach compares each lift to its own
// history, not to the other lifts.
//
// Fed today by lift_history. Backlog 4.4 swaps the source to set_logs
// with Epley e1RM; the component takes the same shape either way.
// ============================================================

import { PALETTE, shortDate } from '@/lib/athlete/metrics';

/** @param lifts [{ key, label, points: [{ t, v }] }] */
export default function StrengthSmalls({ lifts }) {
  const withData = lifts.filter((l) => l.points.length > 0);
  if (!withData.length) {
    return (
      <p className="text-[12px] text-muted">
        No lifts recorded yet — these fill in as sets are logged.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: PALETTE.grid }}>
      {lifts.map((l) => (
        <div key={l.key} className="bg-white px-4 py-3.5">
          <div className="text-[9px] font-bold tracking-[0.13em] uppercase text-muted mb-1">{l.label}</div>
          <Small points={l.points} />
        </div>
      ))}
    </div>
  );
}

function Small({ points }) {
  if (!points.length) {
    return (
      <>
        <div className="font-semibold text-[19px] text-muted leading-tight">—</div>
        <div className="text-[11px] text-muted mt-0.5">not recorded</div>
        <div style={{ height: 44 }} />
      </>
    );
  }
  const last = points[points.length - 1].v;
  const first = points[0].v;
  const delta = +(last - first).toFixed(1);
  const W = 200, H = 44;

  if (points.length === 1) {
    return (
      <>
        <div className="font-display font-extrabold text-[22px] text-blue tabular-nums leading-tight">{last}kg</div>
        <div className="text-[11px] text-muted mt-0.5">one reading · {shortDate(points[0].t)}</div>
        <div style={{ height: H }} />
      </>
    );
  }

  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const rg = hi - lo || 1;
  const X = (i) => 4 + (i / (points.length - 1)) * (W - 8);
  const Y = (v) => H - 6 - ((v - lo) / rg) * (H - 16);
  const d = 'M' + points.map((p, i) => `${X(i)},${Y(p.v)}`).join(' L');

  const tone = delta > 0 ? { bg: PALETTE.goodWash, fg: PALETTE.good, g: '↑ +' }
             : delta < 0 ? { bg: PALETTE.critWash, fg: PALETTE.crit, g: '↓ ' }
             : { bg: PALETTE.none, fg: PALETTE.muted, g: '→ ' };

  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-display font-extrabold text-[22px] text-blue tabular-nums leading-tight">{last}kg</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-[3px] tabular-nums"
              style={{ background: tone.bg, color: tone.fg }}>
          {tone.g}{Math.abs(delta).toFixed(1)}kg
        </span>
      </div>
      <div className="text-[11px] text-muted mt-0.5">
        e1RM · since {shortDate(points[0].t)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full mt-1.5"
           style={{ height: H, overflow: 'visible' }} aria-hidden="true">
        <path d={d} fill="none" stroke={PALETTE.series} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={X(points.length - 1)} cy={Y(last)} r="4" fill={PALETTE.series}
                stroke={PALETTE.surface} strokeWidth="2" />
      </svg>
    </>
  );
}
