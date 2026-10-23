'use client';

/**
 * Still active: the number PACT is judged on. For everyone who ever started
 * with this coach (intent to treat: athletes who left or never switched
 * PACT on are counted too), the share active in the fortnight ending on day
 * 30, 60 and 90, against the 82% month-3 baseline. "Not yet" means nobody
 * has reached that day. Engine GET /v1/coach/retention; nothing invented.
 */
import { useEffect, useState } from 'react';

function Cell({ m, baseline }) {
  if (!m || !m.eligible) return <span className="text-muted">not yet</span>;
  const pct = Math.round((m.rate ?? 0) * 100);
  const vs = baseline != null ? pct - Math.round(baseline * 100) : null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-1.5 w-16 bg-bg-alt rounded-sm overflow-hidden">
        <span className="block h-full bg-blue" style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className="font-semibold text-blue tabular-nums">{pct}%</span>
      <span className="text-muted tabular-nums">{m.active} of {m.eligible}</span>
      {vs != null && <span className="text-muted tabular-nums">({vs >= 0 ? '+' : ''}{vs} pts vs baseline)</span>}
    </span>
  );
}

export default function RetentionPanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/retention', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j && !j.error ? j : null))
      .catch(() => setData(null));
  }, []);
  if (!data || !data.started) return null;
  const o = data.overall || {};
  const cohorts = (data.cohorts || []).slice(-6);
  const month = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return (
    <section className="bg-white rounded-lg shadow-card border border-border p-5">
      <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted">Still active · everyone who started</p>
      <p className="mt-2 text-sm text-body">{data.line}</p>
      <table className="w-full mt-3 text-sm">
        <tbody>
          <tr className="border-t border-border"><td className="py-2 text-blue">Month 1 <span className="text-muted">(days 16 to 30)</span></td><td className="py-2 pl-4"><Cell m={o.m1} /></td></tr>
          <tr className="border-t border-border"><td className="py-2 text-blue">Month 2 <span className="text-muted">(days 46 to 60)</span></td><td className="py-2 pl-4"><Cell m={o.m2} /></td></tr>
          <tr className="border-t border-border"><td className="py-2 text-blue">Month 3 <span className="text-muted">(days 76 to 90)</span></td><td className="py-2 pl-4"><Cell m={o.m3} baseline={data.baseline} /></td></tr>
        </tbody>
      </table>
      {cohorts.length > 1 && (
        <table className="w-full mt-4 text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="font-semibold pb-2">Started</th>
              <th className="font-semibold pb-2 text-right">Athletes</th>
              <th className="font-semibold pb-2 text-right">Month 1</th>
              <th className="font-semibold pb-2 text-right">Month 2</th>
              <th className="font-semibold pb-2 text-right">Month 3</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => {
              const f = (m) => (m.eligible ? `${Math.round((m.rate ?? 0) * 100)}%` : 'not yet');
              return (
                <tr key={c.month} className="border-t border-border text-blue">
                  <td className="py-1.5">{month(c.month)}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.started}</td>
                  <td className="py-1.5 text-right tabular-nums">{f(c.m1)}</td>
                  <td className="py-1.5 text-right tabular-nums">{f(c.m2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{f(c.m3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-muted">Active means they logged, trained, replied, weighed in, rated their mood or ticked a pact in that fortnight. Athletes who left or never switched PACT on are counted, so the number is the honest one. Baseline 82% at month 3 (industry).</p>
    </section>
  );
}
