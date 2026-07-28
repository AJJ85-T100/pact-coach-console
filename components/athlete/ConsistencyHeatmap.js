'use client';

// ============================================================
// Consistency — 8 weeks × 4 behaviours.
//
// The section Trainerize has no answer to: they show a weekly
// compliance strip, we can run four independent behaviours over
// eight weeks because we hold daily_pacts and workout_logs.
//
// Emphasis is deliberately inverted: "done" is the quietest state,
// misses are solid Drive Red. A wall of saturated green is a wall of
// noise — what a coach scans for is the gap. It also gives the three
// states real lightness separation, so the pattern survives greyscale,
// colour-blindness and a printed page.
// ============================================================

import { useState } from 'react';
import { PALETTE, GLYPH, fmtNum, shortDateY } from '@/lib/athlete/metrics';
import { Tooltip } from './ChartBits';

const CELL = {
  good: { bg: PALETTE.goodWash, fg: PALETTE.good, word: 'Done' },
  warn: { bg: PALETTE.warn,     fg: '#3D2703',    word: 'Partial' },
  crit: { bg: PALETTE.crit,     fg: '#FFFFFF',    word: 'Missed' },
  rest: { bg: 'transparent',    fg: PALETTE.muted, word: 'Rest day', border: true },
  none: { bg: PALETTE.none,     fg: PALETTE.muted, word: 'No data' },
};

export default function ConsistencyHeatmap({ series, targets }) {
  const [tip, setTip] = useState(null);
  const slice = series.slice(-56);

  const ROWS = [
    {
      label: 'Training', sub: 'programmed sessions',
      fn: (d) => (!d.trainDay ? 'rest' : d.trained ? 'good' : 'crit'),
      detail: (d) => [['Programmed', d.trainDay ? 'Yes' : 'Rest day'],
                      ['Logged', d.trained ? (d.sessionName || 'Yes') : 'No']],
    },
    {
      label: 'Nutrition', sub: 'food logged',
      fn: (d) => (d.protein != null ? 'good' : d.calories != null ? 'warn' : 'crit'),
      detail: (d) => [['Logged', d.calories != null
        ? `${fmtNum(d.calories)} kcal${d.protein != null ? ` · ${fmtNum(d.protein)}g P` : ' · macros missing'}`
        : 'nothing logged']],
    },
    {
      label: 'Steps', sub: targets.steps ? `vs ${fmtNum(targets.steps)} target` : 'no target set',
      fn: (d) => {
        if (d.steps == null || !targets.steps) return 'none';
        return d.steps >= targets.steps ? 'good' : d.steps >= targets.steps * 0.7 ? 'warn' : 'crit';
      },
      detail: (d) => [['Steps', d.steps == null ? 'no data' : `${fmtNum(d.steps)}${targets.steps ? ` / ${fmtNum(targets.steps)}` : ''}`]],
    },
    {
      label: 'Pacts', sub: 'kept',
      fn: (d) => (d.pact == null ? 'none' : d.pact ? 'good' : 'crit'),
      detail: (d) => [['Daily pact', d.pact == null ? 'not set' : d.pact ? 'Kept' : 'Broken'],
                      ...(d.pactWins != null ? [['Wins', `${d.pactWins}/${d.pactTotal ?? '?'}`]] : [])],
    },
  ];

  const weeks = [];
  for (let i = 0; i < slice.length; i += 7) weeks.push(slice.slice(i, i + 7));

  return (
    <>
      <div className="flex gap-4 flex-wrap text-[11.5px] text-body mb-4">
        {['good', 'warn', 'crit', 'rest'].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className="inline-grid place-items-center w-[15px] h-[15px] rounded-sm text-[10px] font-bold"
               style={{ background: CELL[s].bg, color: CELL[s].fg, border: CELL[s].border ? `1px solid ${PALETTE.grid}` : 'none' }}>
              {GLYPH[s]}
            </i>
            {CELL[s].word}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto scroll-thin">
        <div className="min-w-[560px]">
          {ROWS.map((R, ri) => (
            <div key={ri} className="grid grid-cols-[110px_1fr] gap-x-3 items-center">
              <div className="text-[11.5px] text-body text-right py-1 leading-tight">
                {R.label}
                <span className="block text-[10px] text-muted">{R.sub}</span>
              </div>
              <div className="flex gap-1.5 py-1">
                {weeks.map((wk, wi) => (
                  <div key={wi} className="flex gap-[2px] flex-1">
                    {wk.map((d, di) => {
                      const s = R.fn(d);
                      const c = CELL[s];
                      return (
                        <div key={di} tabIndex={0} role="img"
                          aria-label={`${R.label} ${shortDateY(d.date)}: ${c.word}`}
                          className="flex-1 h-[21px] rounded-sm grid place-items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue"
                          style={{ background: c.bg, border: c.border ? `1px solid ${PALETTE.grid}` : 'none' }}
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setTip({ x: r.left + r.width / 2, y: r.top,
                              title: `${R.label} · ${shortDateY(d.date)}`,
                              rows: [['Status', `${GLYPH[s]} ${c.word}`], ...R.detail(d)] });
                          }}
                          onFocus={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setTip({ x: r.left + r.width / 2, y: r.top,
                              title: `${R.label} · ${shortDateY(d.date)}`,
                              rows: [['Status', `${GLYPH[s]} ${c.word}`], ...R.detail(d)] });
                          }}
                          onMouseLeave={() => setTip(null)}
                          onBlur={() => setTip(null)}>
                          <span className="text-[11px] font-bold leading-none"
                                style={{ color: c.fg, opacity: s === 'rest' ? 0.55 : 1 }}>
                            {GLYPH[s]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="grid grid-cols-[110px_1fr] gap-x-3">
            <div />
            <div className="flex justify-between text-[10.5px] text-muted mt-1">
              <span>{shortDateY(slice[0].date)}</span>
              <span>{shortDateY(slice[Math.floor(slice.length / 2)].date)}</span>
              <span>Today</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11.5px] text-muted mt-3 leading-snug">
        Every cell carries a glyph as well as a colour, and the three states differ in lightness —
        the pattern survives greyscale, colour-blindness and a printed page. &ldquo;Done&rdquo; is
        deliberately the quietest state so the misses are what your eye lands on.
      </p>

      <Tooltip state={tip} />
    </>
  );
}
