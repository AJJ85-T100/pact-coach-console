'use client';

// ============================================================
// Journey — the hero chart.
//
// 2px trend line over the raw weigh-ins, target reference rule,
// range tabs, crosshair tooltip. Implausible readings render as a
// hollow red ring with a "!" and are excluded from the trend and
// from every figure in the rail.
// ============================================================

import { useMemo, useRef, useState } from 'react';
import { PALETTE, DAY_MS, fmtNum, shortDate, shortDateY } from '@/lib/athlete/metrics';
import { Tooltip } from './ChartBits';

const RANGES = [
  { label: '4w',  days: 28 },
  { label: '12w', days: 84 },
  { label: '6m',  days: 182 },
  { label: 'All', days: 100000 },
];

const W = 760, H = 290, M = { t: 16, r: 64, b: 34, l: 46 };

export default function JourneyChart({ journey }) {
  const { points = [], raw = [], start, target, current, lost, toGo, pace, etaWeeks, flagged = [] } = journey || {};
  const [rangeDays, setRangeDays] = useState(100000);
  const [showRaw, setShowRaw] = useState(true);
  const [tip, setTip] = useState(null);
  const svgRef = useRef(null);

  const geo = useMemo(() => {
    const now = Date.now();
    const from = now - (rangeDays - 1) * DAY_MS;
    const tr = points.filter((p) => p.t >= from);
    const rw = raw.filter((r) => r.t >= from);
    if (tr.length < 2) return null;

    const x0 = tr[0].t, x1 = Math.max(now, tr[tr.length - 1].t);
    const vals = tr.map((p) => p.v)
      .concat(rw.filter((r) => !r.suspect).map((r) => r.w))
      .concat(target != null ? [target] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(0.8, (hi - lo) * 0.14);
    lo -= pad; hi += pad;

    const X = (t) => M.l + ((t - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
    const Y = (v) => M.t + ((hi - v) / (hi - lo)) * (H - M.t - M.b);
    return { tr, rw, x0, x1, lo, hi, X, Y };
  }, [points, raw, rangeDays, target]);

  if (!geo) {
    return (
      <p className="text-[12px] text-muted py-6">
        Not enough weigh-ins yet to draw a journey — two readings will start the line.
      </p>
    );
  }

  const { tr, rw, x0, x1, lo, hi, X, Y } = geo;
  const step = (hi - lo) > 28 ? 5 : (hi - lo) > 12 ? 2 : 1;
  const yTicks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
  const nTicks = Math.min(6, Math.max(3, Math.round((x1 - x0) / DAY_MS / 30)));
  const xTicks = Array.from({ length: nTicks + 1 }, (_, i) => x0 + ((x1 - x0) * i) / nTicks);

  const pts = tr.map((p) => [X(p.t), Y(p.v)]);
  const linePath = 'M' + pts.map((p) => p.join(',')).join(' L');
  const areaPath = `M${pts[0][0]},${H - M.b} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${pts[pts.length - 1][0]},${H - M.b} Z`;
  const lastPt = pts[pts.length - 1];
  const cleanRaw = rw.filter((r) => !r.suspect);
  const dense = cleanRaw.length > 110;

  function onMove(ev) {
    const bb = svgRef.current.getBoundingClientRect();
    const px = ((ev.clientX - bb.left) / bb.width) * W;
    const t = x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0);
    let best = tr[0], bd = Infinity;
    tr.forEach((p) => { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = p; } });

    const rawHere = raw.find((r) => r.key === best.key);
    // nearest trend point at least ~7 days back
    const wkTarget = best.t - 7 * DAY_MS;
    let wk = null, wkd = Infinity;
    tr.forEach((p) => { if (p.t > best.t) return; const d = Math.abs(p.t - wkTarget); if (d < wkd) { wkd = d; wk = p; } });
    if (wk && (wkd > 4 * DAY_MS || wk === best)) wk = null;

    const rows = [['7-day trend', `${best.v.toFixed(1)}kg`]];
    if (rawHere && !rawHere.suspect) rows.push(['Weighed', `${rawHere.w.toFixed(1)}kg`]);
    if (wk) { const d = best.v - wk.v; rows.push(['vs a week before', `${d > 0 ? '+' : ''}${d.toFixed(1)}kg`]); }
    if (start != null) rows.push(['Since start', `${(best.v - start).toFixed(1)}kg`]);
    if (target != null) rows.push(['To target', `${(best.v - target).toFixed(1)}kg`]);

    setTip({
      x: ev.clientX, y: ev.clientY, title: shortDateY(best.t), rows,
      warn: rawHere && rawHere.suspect ? `Reading of ${rawHere.w}kg looks wrong — excluded from the trend` : null,
      cx: X(best.t), cy: Y(best.v),
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="flex gap-4 flex-wrap text-[11.5px] text-body items-center mr-auto">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4 h-0.5 rounded-sm" style={{ background: PALETTE.series }} /> 7-day trend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-2 h-2 rounded-full" style={{ background: PALETTE.seriesSoft }} /> Weigh-in
          </span>
          {target != null && (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-4 h-0" style={{ borderTop: `2px dotted ${PALETTE.reference}` }} /> Target {target}kg
            </span>
          )}
          {flagged.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-2 h-2 rounded-full border-2" style={{ borderColor: PALETTE.accent }} /> Flagged
            </span>
          )}
        </div>
        <div className="inline-flex border border-border rounded overflow-hidden" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.label} type="button" onClick={() => setRangeDays(r.days)}
              aria-pressed={rangeDays === r.days}
              className={`text-[11px] font-semibold px-2.5 py-1 border-l first:border-l-0 border-border transition-colors ${
                rangeDays === r.days ? 'bg-blue text-white' : 'text-muted hover:bg-bg hover:text-blue'
              }`}>{r.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setShowRaw((s) => !s)} aria-pressed={showRaw}
          className="text-[11px] font-semibold text-muted hover:text-blue underline underline-offset-[3px]">
          {showRaw ? 'Hide weigh-ins' : 'Show weigh-ins'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_210px] gap-6">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto overflow-visible"
             role="img"
             aria-label={`Weight journey${start != null ? ` from ${start}kg` : ''} to ${current}kg${target != null ? ` against a ${target}kg target` : ''}`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke={PALETTE.grid} strokeWidth="1" />
              <text x={M.l - 9} y={Y(v) + 3.5} textAnchor="end" fill={PALETTE.muted} fontSize="10.5">{v}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={X(t)} y={H - M.b + 18} fill={PALETTE.muted} fontSize="10.5"
                  textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
              {shortDate(t)}
            </text>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={PALETTE.baseline} strokeWidth="1" />

          {target != null && target > lo && target < hi && (
            <>
              <line x1={M.l} x2={W - M.r} y1={Y(target)} y2={Y(target)} stroke={PALETTE.reference}
                    strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
              <text x={W - M.r + 7} y={Y(target) + 3.5} fill={PALETTE.muted} fontSize="10.5">Target</text>
            </>
          )}

          <path d={areaPath} fill={PALETTE.seriesWash} />

          {showRaw && cleanRaw.map((r, i) => (
            <circle key={i} cx={X(r.t)} cy={Y(r.w)} r={dense ? 2.6 : 3.6}
                    fill={PALETTE.seriesSoft} stroke={PALETTE.surface} strokeWidth={dense ? 1 : 2}
                    opacity={dense ? 0.85 : 1} />
          ))}

          <path d={linePath} fill="none" stroke={PALETTE.series} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />

          {rangeDays > 200 && start != null && (
            <text x={pts[0][0] + 4} y={pts[0][1] - 9} fill={PALETTE.muted} fontSize="11.5" fontWeight="600">
              {Number(start).toFixed(1)}kg
            </text>
          )}
          <circle cx={lastPt[0]} cy={lastPt[1]} r="5" fill={PALETTE.series} stroke={PALETTE.surface} strokeWidth="2" />
          <text x={lastPt[0] + 9} y={lastPt[1] - 8} fill={PALETTE.ink} fontSize="11.5" fontWeight="600">
            {current != null ? `${current.toFixed(1)}kg` : ''}
          </text>

          {rw.filter((r) => r.suspect).map((r, i) => {
            const cy = r.w < lo ? H - M.b - 3 : r.w > hi ? M.t + 3 : Y(r.w);
            return (
              <g key={`f${i}`}>
                <circle cx={X(r.t)} cy={cy} r="5" fill={PALETTE.surface} stroke={PALETTE.accent} strokeWidth="2" />
                <text x={X(r.t)} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill={PALETTE.accent}>!</text>
              </g>
            );
          })}

          {tip && (
            <>
              <line x1={tip.cx} x2={tip.cx} y1={M.t} y2={H - M.b} stroke={PALETTE.baseline} strokeWidth="1" />
              <circle cx={tip.cx} cy={tip.cy} r="5.5" fill={PALETTE.series} stroke={PALETTE.surface} strokeWidth="2" />
            </>
          )}

          <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent"
                style={{ cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setTip(null)} />
        </svg>

        <div className="lg:border-l lg:pl-5 border-border grid grid-cols-2 lg:grid-cols-1 gap-x-4 lg:gap-0 border-t lg:border-t-0 pt-4 lg:pt-0">
          <RailItem label="Current" hero value={current != null ? `${current.toFixed(1)}kg` : '—'}
                    note={journey.lastCleanLabel ? `trend from ${journey.cleanCount} weigh-ins · last ${journey.lastCleanLabel}` : 'no clean readings yet'} />
          <RailItem label="Lost so far"
                    value={lost == null ? '—' : `${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)}kg`}
                    note={lost != null && start ? `${((lost / start) * 100).toFixed(1)}% of body weight` : ''} />
          <RailItem label={toGo != null && toGo <= 0 ? 'Past target by' : 'To target'}
                    value={toGo == null ? '—' : `${Math.abs(toGo).toFixed(1)}kg`}
                    note={target != null ? `${target}kg target` : 'no target set'} />
          <RailItem label="Pace (8 wk)"
                    value={pace == null ? '—' : `${pace > 0 ? '−' : '+'}${Math.abs(pace).toFixed(2)}kg/wk`}
                    note={etaWeeks ? `target ≈ ${shortDate(Date.now() + etaWeeks * 7 * DAY_MS)} at this pace`
                        : pace == null ? 'not enough history' : 'plateaued — no ETA'} />
        </div>
      </div>

      {flagged.length > 0 && (
        <p className="text-[11.5px] text-muted mt-3 leading-snug">
          ⚠ {flagged.length} reading{flagged.length > 1 ? 's' : ''} flagged as implausible
          {' '}({flagged.map((f) => `${f.w}kg on ${shortDate(f.t)}`).join(', ')}) — excluded from the trend
          and from every figure on this card. Worth asking about: a stone value typed into a kg field
          looks exactly like this.
        </p>
      )}

      <Tooltip state={tip} />
    </>
  );
}

function RailItem({ label, value, note, hero }) {
  return (
    <div className="py-2 lg:py-2.5 lg:border-t border-border first:border-t-0">
      <div className="text-[9px] font-bold tracking-[0.13em] uppercase text-muted mb-0.5">{label}</div>
      <div className={`font-display font-extrabold text-blue leading-tight tabular-nums ${hero ? 'text-[44px]' : 'text-[22px]'}`}>
        {value}
      </div>
      {note && <div className="text-[11.5px] text-muted leading-snug">{note}</div>}
    </div>
  );
}
