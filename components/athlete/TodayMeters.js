'use client';

// ============================================================
// Today — eight meters replacing the seven-tile em-dash grid.
//
// The important part is not the charts, it's that "not logged" is a
// visibly different component from a real number. Three empty states:
// never had it, source has stopped, athlete didn't log.
// ============================================================

import { useState } from 'react';
import { PALETTE, GLYPH, WORD, fmtNum, shortDate, statusFor } from '@/lib/athlete/metrics';
import { Sparkline, Pill, Tooltip } from './ChartBits';

const DEFS = [
  { k: 'steps',    label: 'Steps',    fmt: (v) => fmtNum(v),            dir: 'more' },
  { k: 'calories', label: 'Calories', fmt: (v) => fmtNum(v),            dir: 'band' },
  { k: 'protein',  label: 'Protein',  fmt: (v) => `${fmtNum(v)}g`,      dir: 'more' },
  { k: 'carbs',    label: 'Carbs',    fmt: (v) => `${fmtNum(v)}g`,      dir: 'band' },
  { k: 'fat',      label: 'Fat',      fmt: (v) => `${fmtNum(v)}g`,      dir: 'band' },
  { k: 'sleep',    label: 'Sleep',    fmt: (v) => `${fmtNum(v, 1)}h`,   dir: 'more' },
  { k: 'mood',     label: 'Mood',     fmt: (v) => `${fmtNum(v, 1)}/5`,  dir: 'more' },
];

/**
 * @param series  dense day rows, oldest → newest, last entry is today
 * @param targets { steps, calories, protein, carbs, fat, sleep }
 * @param session { state: 'good'|'crit'|'rest', next, done, planned }
 */
export default function TodayMeters({ series, targets, session }) {
  const [tip, setTip] = useState(null);
  const today = series[series.length - 1] || {};
  const last14 = series.slice(-14);

  function hover(ev, def) {
    const bb = ev.currentTarget.getBoundingClientRect();
    const idx = Math.max(0, Math.min(last14.length - 1,
      Math.round(((ev.clientX - bb.left) / bb.width) * (last14.length - 1))));
    const d = last14[idx];
    if (!d) return;
    const v = d[def.k];
    const t = targets[def.k];
    const rows = [['Value', v == null ? 'not logged' : def.fmt(v)]];
    if (t) rows.push(['Target', def.fmt(t)]);
    if (v != null && t) rows.push(['Hit', `${Math.round((v / t) * 100)}%`]);
    setTip({ x: ev.clientX, y: ev.clientY, title: `${def.label} · ${shortDate(d.date)}`, rows });
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: PALETTE.grid }}>
        {DEFS.map((def) => {
          const v = today[def.k];
          const target = targets[def.k] || null;
          const values = last14.map((d) => d[def.k]);
          const prev = [...series].reverse().find((d, i) => i > 0 && d[def.k] != null);
          const gapDays = prev ? Math.round((new Date(today.date) - new Date(prev.date)) / 86400000) : null;

          if (v == null) {
            return (
              <Tile key={def.k} label={def.label} onMove={(e) => hover(e, def)} onLeave={() => setTip(null)}>
                <div className="font-semibold text-[19px] text-muted leading-tight">Not logged</div>
                <div className="h-[7px] rounded-sm my-2"
                     style={{ background: `repeating-linear-gradient(135deg, ${PALETTE.none}, ${PALETTE.none} 4px, transparent 4px, transparent 8px)` }} />
                <div className="min-h-[20px] flex items-center gap-2 flex-wrap text-[11.5px]">
                  <Pill status="none">· {gapDays > 2 ? `${gapDays} days silent` : 'nothing today'}</Pill>
                </div>
                <div className="text-[11px] text-muted min-h-[18px]">
                  {prev ? `last ${def.fmt(prev[def.k])} on ${shortDate(prev.date)}` : 'never logged'}
                </div>
                <Sparkline values={values} target={target} />
              </Tile>
            );
          }

          const st = statusFor(v, target, def.dir);
          const pct = target ? Math.min(100, (v / target) * 100) : (def.k === 'mood' ? (v / 5) * 100 : 100);
          const fill = st ? PALETTE[st === 'good' ? 'good' : st === 'warn' ? 'warn' : 'crit'] : PALETTE.series;

          return (
            <Tile key={def.k} label={def.label} onMove={(e) => hover(e, def)} onLeave={() => setTip(null)}>
              <div className="flex items-baseline gap-2">
                <span className="font-display font-extrabold text-[27px] text-blue leading-tight tabular-nums">{def.fmt(v)}</span>
                <span className="text-[11.5px] text-muted tabular-nums">{target ? `/ ${def.fmt(target)}` : 'no target set'}</span>
              </div>
              <div className="h-[7px] rounded-sm my-2 relative overflow-hidden" style={{ background: PALETTE.none }}>
                <div className="h-full rounded-l-sm" style={{ width: `${pct}%`, background: fill }} />
                {target && (
                  <div className="absolute inset-y-0" style={{ left: '90%', right: 0, borderLeft: `1px solid ${PALETTE.baseline}`, opacity: 0.55 }} />
                )}
              </div>
              <div className="min-h-[20px] flex items-center gap-2 flex-wrap text-[11.5px]">
                {st && <Pill status={st}>{GLYPH[st]} {WORD[st]}</Pill>}
                <span className="text-[11px] text-muted">
                  {target ? `${Math.round((v / target) * 100)}% of target` : 'self-reported'}
                </span>
              </div>
              <div className="min-h-[18px]" />
              <Sparkline values={values} target={target} />
            </Tile>
          );
        })}

        {/* Session — the thing a PT looks for first, and currently nowhere on the card */}
        <Tile label="Session">
          <div className={`leading-tight ${session.state === 'rest'
              ? 'font-semibold text-[19px] text-muted'
              : 'font-display font-extrabold text-[27px] text-blue'}`}>
            {session.state === 'rest' ? 'Rest day' : session.state === 'good' ? 'Completed' : 'Missed'}
          </div>
          <div className="h-[7px] rounded-sm my-2" style={{ background: PALETTE.none }}>
            {session.state !== 'rest' && (
              <div className="h-full w-full rounded-sm"
                   style={{ background: session.state === 'good' ? PALETTE.good : PALETTE.crit }} />
            )}
          </div>
          <div className="min-h-[20px] flex items-center gap-2 flex-wrap text-[11.5px]">
            {session.state === 'rest'
              ? <Pill status="none">· not programmed</Pill>
              : <Pill status={session.state}>{GLYPH[session.state]} {session.state === 'good' ? 'Logged' : 'No log'}</Pill>}
            {session.next && <span className="text-[11px] text-muted">next {session.next}</span>}
          </div>
          <div className="text-[11px] text-muted min-h-[18px]">
            {session.planned > 0 ? `${session.done}/${session.planned} sessions in 28 days` : 'no programmed days set'}
          </div>
          <Sparkline values={last14.map((d) => (d.trainDay ? (d.trained ? 1 : 0) : null))} />
        </Tile>
      </div>
      <Tooltip state={tip} />
    </>
  );
}

function Tile({ label, children, onMove, onLeave }) {
  return (
    <div className="bg-white px-4 py-3.5" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="text-[9px] font-bold tracking-[0.13em] uppercase text-muted mb-1">{label}</div>
      {children}
    </div>
  );
}
