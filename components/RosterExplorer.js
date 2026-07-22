'use client';

/**
 * RosterExplorer — the interactive half of /dashboard/athletes.
 *
 * The server page computes each athlete's stats (RAG strips, risk, trend,
 * engagement, programme) and hands the array here; this component owns the
 * working search box + filter tabs + card grid. Search matches name, goal
 * and programme name; tabs filter by the shared risk tier.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

function initials(name) {
  if (!name) return '??';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function RosterExplorer({ athletes }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | low | medium | high

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (athletes || []).filter((a) => {
      if (filter !== 'all' && a.risk !== filter) return false;
      if (!q) return true;
      const hay = [
        a.name,
        a.goal,
        a.currentProgramme?.name,
        a.gym,
        a.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [athletes, query, filter]);

  const counts = useMemo(() => ({
    all: athletes.length,
    low: athletes.filter((a) => a.risk === 'low').length,
    medium: athletes.filter((a) => a.risk === 'medium').length,
    high: athletes.filter((a) => a.risk === 'high').length,
  }), [athletes]);

  return (
    <>
      <div className="hidden md:block flex-1 max-w-md ml-auto -mt-14 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, goal, programme…"
          className="w-full bg-white border border-border rounded px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
        />
      </div>

      {/* Mobile search */}
      <div className="md:hidden mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search athletes…"
          className="w-full bg-white border border-border rounded px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Tab label="All"      count={counts.all}    active={filter === 'all'}    onClick={() => setFilter('all')} />
        <Tab label="On track" count={counts.low}    active={filter === 'low'}    onClick={() => setFilter('low')} />
        <Tab label="Watch"    count={counts.medium} active={filter === 'medium'} onClick={() => setFilter('medium')} />
        <Tab label="At risk"  count={counts.high}   active={filter === 'high'}   warn={counts.high > 0} onClick={() => setFilter('high')} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-card border border-border p-10 text-center mt-6">
          <p className="text-body text-sm">
            {query
              ? <>No athletes match &ldquo;{query}&rdquo;{filter !== 'all' ? ' in this filter' : ''}.</>
              : 'No athletes in this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
          {filtered.map((a) => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      )}
    </>
  );
}

function Tab({ label, count, active, warn, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded text-[11px] font-bold tracking-wider uppercase border transition-colors ${
        active
          ? 'bg-blue text-white border-blue'
          : warn
            ? 'bg-white text-red border-red/30 hover:border-red'
            : 'bg-white text-muted border-border hover:text-blue hover:border-blue'
      }`}
    >
      {label} <span className={`ml-1 ${active ? 'text-white/70' : 'text-muted'}`}>{count}</span>
    </button>
  );
}

function AthleteCard({ athlete: a }) {
  const accentClass = a.isAtRisk ? 'border-t-warn' : 'border-t-blue';
  const initialsBg  = a.isAtRisk ? 'bg-warn-light text-warn-dark' : 'bg-bg-alt text-blue';

  return (
    <Link
      href={`/dashboard/clients/${a.id}`}
      className={`block bg-white rounded-lg shadow-card border border-border border-t-4 ${accentClass} hover:shadow-card-hover transition-all`}
    >
      <div className="p-5 space-y-4">

        {/* Header: avatar + name + goal + engagement score */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded grid place-items-center font-display font-bold text-sm flex-shrink-0 ${initialsBg}`}>
              {initials(a.name)}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-blue text-sm truncate">
                {a.name}
              </div>
              <div className="text-[11px] text-muted truncate">
                {(a.goal || 'no goal').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
          <EngagementScore score={a.engagement} />
        </div>

        {/* Programme strip — current training programme */}
        <ProgrammeStrip programme={a.currentProgramme} />

        {/* 7-day RAG strips */}
        <div className="space-y-2">
          <RAGStrip label="STEPS"     days={a.stepDays} />
          <RAGStrip label="NUTRITION" days={a.nutritionDays} />
          <RAGStrip label="PACTS"     days={a.pactDays} />
        </div>

        {/* Trend + risk */}
        <div className="flex gap-2">
          <TrendBadge trend={a.trend} />
          <RiskBadge  risk={a.risk} />
        </div>

        {/* Weight progress */}
        <ProgressBar
          lost={a.lost}
          toGo={a.toGo}
          start={a.start_weight}
          target={a.target_weight}
        />
      </div>
    </Link>
  );
}

function ProgrammeStrip({ programme }) {
  if (!programme) {
    return (
      <div className="flex items-center justify-between gap-2 py-2 px-3 bg-bg/60 rounded border border-dashed border-border">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted">
          No programme
        </div>
        <span className="text-[9px] font-semibold tracking-wider uppercase text-red">
          + Build one
        </span>
      </div>
    );
  }

  const isActive = programme.status === 'active';
  const accentColor = isActive ? 'border-l-emerald-500' : 'border-l-red';

  return (
    <div className={`flex items-center justify-between gap-2 py-2 px-3 bg-bg/60 rounded border-l-2 ${accentColor}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-muted leading-none mb-1">
          On programme
        </div>
        <div className="text-xs font-semibold text-blue truncate leading-tight">
          {programme.name}
          {programme.weeks ? (
            <span className="text-muted font-normal ml-1.5">· {programme.weeks}wk</span>
          ) : null}
        </div>
      </div>
      <span className={`text-[8px] font-bold tracking-[0.15em] uppercase px-1.5 py-1 rounded flex-shrink-0 border ${
        isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                   'bg-white text-blue border-border'
      }`}>
        {programme.status}
      </span>
    </div>
  );
}

function EngagementScore({ score }) {
  const isLow = score < 50;
  const ringColor = isLow ? 'border-warn text-warn-dark' : 'border-blue text-blue';
  return (
    <div className="flex flex-col items-end flex-shrink-0">
      <div className={`w-11 h-11 rounded-full border-2 ${ringColor} grid place-items-center font-display font-bold text-sm tabular-nums`}>
        {score}
      </div>
      <div className="text-[8px] font-bold text-muted tracking-widest uppercase mt-1">
        Engagement
      </div>
    </div>
  );
}

function RAGStrip({ label, days }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[9px] font-bold text-muted tracking-[0.12em] uppercase w-[68px] flex-shrink-0">
        {label}
      </div>
      <div className="flex-1 grid grid-cols-7 gap-1">
        {days.map((status, i) => (
          <div
            key={i}
            className={`h-2.5 rounded-sm transition-opacity ${
              status === 'green' ? 'bg-emerald-500' :
              status === 'amber' ? 'bg-warn'        :
              status === 'red'   ? 'bg-red'         :
                                   'bg-bg-alt'
            }`}
            title={`Day ${i - 6}: ${status}`}
          />
        ))}
      </div>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    declining: { arrow: '↓', label: 'Declining', cls: 'bg-red/10 text-red border-red/30' },
    building:  { arrow: '↑', label: 'Building',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    steady:    { arrow: '→', label: 'Steady',    cls: 'bg-bg text-muted border-border' },
  };
  const m = map[trend] || map.steady;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border inline-flex items-center gap-1 ${m.cls}`}>
      <span>{m.arrow}</span> {m.label}
    </span>
  );
}

function RiskBadge({ risk }) {
  const map = {
    high:   { icon: '⚠', label: 'High risk', cls: 'bg-red/10 text-red border-red/30' },
    medium: { icon: '○', label: 'Watch',     cls: 'bg-warn-light text-warn-dark border-warn/30' },
    low:    { icon: '✓', label: 'On track',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const m = map[risk] || map.low;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border inline-flex items-center gap-1 ${m.cls}`}>
      <span>{m.icon}</span> {m.label}
    </span>
  );
}

function ProgressBar({ lost, toGo, start, target }) {
  if (lost == null || start == null || target == null) {
    return <div className="text-[11px] text-muted pt-1">No weight goal set</div>;
  }

  const totalRange = start - target;
  const pct = totalRange !== 0
    ? Math.max(0, Math.min(100, (lost / totalRange) * 100))
    : 0;

  const lostLabel = lost > 0 ? `${lost.toFixed(1)}kg lost`
                  : lost < 0 ? `${Math.abs(lost).toFixed(1)}kg gained`
                             : 'No change';

  const toGoLabel = toGo > 0 ? `${toGo.toFixed(1)}kg to go`
                  : toGo < 0 ? `Past target by ${Math.abs(toGo).toFixed(1)}kg`
                             : 'At target';

  const barColor = pct < 30 ? 'bg-warn' : 'bg-blue';

  return (
    <div className="pt-1">
      <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted tabular-nums">
        <span>{lostLabel}</span>
        <span>{toGoLabel}</span>
      </div>
    </div>
  );
}
