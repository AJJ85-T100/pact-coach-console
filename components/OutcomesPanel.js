'use client';

/**
 * What's working: for each kind of message PAX sends, how often the athlete
 * replied within 4 hours and trained within 24. Last 8 weeks, your roster.
 * Hidden until there's something to show.
 */
import { useEffect, useState } from 'react';

function Pct({ v }) {
  if (v == null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-1.5 w-16 bg-bg-alt rounded-sm overflow-hidden">
        <span className="block h-full bg-blue" style={{ width: `${Math.max(2, v)}%` }} />
      </span>
      <span className="font-semibold text-blue tabular-nums">{v}%</span>
    </span>
  );
}

export default function OutcomesPanel() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    fetch('/api/outcomes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => setRows(j.rows || []))
      .catch(() => setRows([]));
  }, []);
  if (!rows || !rows.length) return null;
  return (
    <section className="bg-white rounded-lg shadow-card border border-border p-5">
      <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted">What’s working · last 8 weeks</p>
      <table className="w-full mt-3 text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="font-semibold pb-2">Message</th>
            <th className="font-semibold pb-2 text-right">Sent</th>
            <th className="font-semibold pb-2 pl-4">Replied in 4h</th>
            <th className="font-semibold pb-2 pl-4">Trained in 24h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} className="border-t border-border">
              <td className="py-2 text-blue">{r.label}</td>
              <td className="py-2 text-right tabular-nums text-body">{r.sent}</td>
              <td className="py-2 pl-4"><Pct v={r.replyRate} /></td>
              <td className="py-2 pl-4"><Pct v={r.trainedRate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted mt-3">Measured from what athletes actually did after each message, not from opens.</p>
    </section>
  );
}
