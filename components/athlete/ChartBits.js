'use client';

// ============================================================
// Shared chart primitives for the athlete card.
// Hand-rolled SVG — no chart library. The four forms we need are
// small enough that a library would cost more bundle than it saves,
// and would fight the brand tokens.
// ============================================================

import { useState, useCallback } from 'react';
import { PALETTE } from '@/lib/athlete/metrics';

/** Fixed-position tooltip. Rendered once per chart, driven by mouse position. */
export function Tooltip({ state }) {
  if (!state) return null;
  const { x, y, rows, title, warn } = state;
  const style = {
    position: 'fixed',
    left: Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260),
    top: Math.max(8, y - 12 - 22 * ((rows?.length || 0) + 1)),
    zIndex: 60,
    pointerEvents: 'none',
  };
  return (
    <div
      style={style}
      className="bg-blue text-white rounded px-3 py-2.5 text-[12px] leading-snug shadow-[0_6px_18px_rgba(10,37,64,0.22)] max-w-[250px]"
      role="status"
    >
      {title && (
        <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-white/60 mb-1">{title}</div>
      )}
      {(rows || []).map((r, i) => (
        <div key={i} className="flex justify-between gap-4 tabular-nums">
          <span className="text-white/70">{r[0]}</span>
          <span>{r[1]}</span>
        </div>
      ))}
      {warn && <div className="text-[11px] mt-1.5" style={{ color: '#FFC77D' }}>⚠ {warn}</div>}
    </div>
  );
}

export function useTooltip() {
  const [state, setState] = useState(null);
  const hide = useCallback(() => setState(null), []);
  return { state, setState, hide, Tooltip: <Tooltip state={state} /> };
}

/**
 * Sparkline. Single series, gaps preserved (a missing day breaks the line
 * rather than interpolating across it — a straight line through a hole is a lie).
 */
export function Sparkline({ values, target = null, height = 26, accent = PALETTE.seriesSoft, width = 200 }) {
  const nn = values.filter((v) => v != null);
  if (nn.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
           className="block w-full" style={{ height }} aria-hidden="true" />
    );
  }
  const lo = Math.min(...nn), hi = Math.max(...nn), rg = hi - lo || 1;
  const X = (i) => (i / (values.length - 1)) * width;
  const Y = (v) => height - 2 - ((v - lo) / rg) * (height - 6);

  let d = '', open = false;
  values.forEach((v, i) => {
    if (v == null) { open = false; return; }
    d += (open ? ' L' : ' M') + X(i) + ',' + Y(v);
    open = true;
  });
  const lastIdx = values.length - 1;
  const lastVal = values[lastIdx];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
         className="block w-full" style={{ height, overflow: 'visible' }} aria-hidden="true">
      {target != null && target >= lo && target <= hi && (
        <line x1="0" x2={width} y1={Y(target)} y2={Y(target)} stroke={PALETTE.grid} strokeWidth="1" />
      )}
      <path d={d} fill="none" stroke={accent} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {lastVal != null && (
        <circle cx={X(lastIdx)} cy={Y(lastVal)} r="3.2" fill={accent}
                stroke={PALETTE.surface} strokeWidth="2" />
      )}
    </svg>
  );
}

/** Status pill — colour is never alone; a glyph and a word always ride with it. */
export function Pill({ status, children }) {
  const map = {
    good: { bg: PALETTE.goodWash, fg: PALETTE.good },
    warn: { bg: PALETTE.warnWash, fg: PALETTE.warnInk },
    crit: { bg: PALETTE.critWash, fg: PALETTE.crit },
    none: { bg: PALETTE.none,     fg: PALETTE.muted },
  }[status] || { bg: PALETTE.none, fg: PALETTE.muted };
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[3px]"
          style={{ background: map.bg, color: map.fg }}>
      {children}
    </span>
  );
}

/** Signed delta chip. Direction glyph is mandatory — see Pill. */
export function Delta({ pct, towardGoal, label }) {
  if (label) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-[3px] tabular-nums"
            style={{ background: PALETTE.none, color: PALETTE.muted }}>
        {label}
      </span>
    );
  }
  const flat = Math.abs(pct) < 2;
  const tone = flat
    ? { bg: PALETTE.none, fg: PALETTE.muted }
    : (towardGoal ? { bg: PALETTE.goodWash, fg: PALETTE.good } : { bg: PALETTE.critWash, fg: PALETTE.crit });
  const glyph = flat ? '→' : (pct > 0 ? '↑' : '↓');
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-[3px] tabular-nums"
          style={{ background: tone.bg, color: tone.fg }}>
      {glyph} {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}
