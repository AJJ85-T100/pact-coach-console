'use client';

// ============================================================
// /dashboard/activity — the incoming-athlete-activity feed.
// Everything the roster logged recently (sessions from the
// athlete app, runs & rides from wearables or manual logs,
// weigh-ins), newest first, with a 7-day per-athlete rollup.
// Polls every 30s so new logs appear while the console is open.
// ============================================================

import { useEffect, useState, useCallback } from 'react';

const ICON = {
  session: '🏋️', run: '🏃', ride: '🚴', walk: '🚶', swim: '🏊',
  row: '🚣', other: '⚡', cardio: '⚡', 'weigh-in': '⚖️',
};

export default function ActivityPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/activity', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="p-8 max-w-5xl">
      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Live from the roster</p>
      <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-1">Activity</h1>
      <p className="text-body text-sm mb-8">Sessions, runs, rides and weigh-ins as your athletes log them. Refreshes automatically.</p>

      {error && <p className="text-red text-sm mb-6">Couldn&apos;t load the feed: {error}</p>}
      {!data && !error && <p className="text-body text-sm">Loading…</p>}

      {data && (
        <>
          {/* 7-day rollup */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {data.rollup.map((r) => (
              <div key={r.clientId} className="bg-white rounded-lg shadow-card p-5">
                <div className="font-display font-bold text-blue text-sm uppercase tracking-wide mb-2">{r.name}</div>
                <div className="text-body text-sm leading-relaxed">
                  <span className="font-semibold text-blue">{r.sessions}</span> session{r.sessions === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-blue">{r.cardio}</span> cardio{r.km ? ` (${r.km} km)` : ''}
                  {r.lastWeighIn ? <> · last weigh-in <span className="font-semibold text-blue">{r.lastWeighIn} kg</span></> : null}
                  <span className="block text-[11px] text-muted mt-1">last 7 days</span>
                </div>
              </div>
            ))}
          </div>

          {/* Feed */}
          <div className="bg-white rounded-lg shadow-card divide-y divide-border">
            {data.feed.length === 0 && (
              <p className="p-6 text-body text-sm">Nothing logged yet — sessions, runs and weigh-ins will appear here the moment an athlete logs them.</p>
            )}
            {data.feed.map((f, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <span className="text-xl w-8 text-center flex-shrink-0">{ICON[f.kind] || '⚡'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-semibold text-blue">{f.client}</span>{' '}
                    <span className="text-body">— {f.title}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{f.detail}</div>
                </div>
                <div className="text-[11px] text-muted flex-shrink-0">{f.date}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
