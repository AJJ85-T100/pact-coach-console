'use client';

/**
 * Who PACT V2 coaches. Switching an athlete on hands their morning, midday
 * and evening messages (and their replies) to the engine; the WhatsApp bot
 * stops sending them its own. Switching off hands them straight back.
 */
import { useEffect, useState } from 'react';

function Dot({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${ok ? 'text-blue' : 'text-muted'}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? 'bg-blue' : 'bg-border'}`} />
      {label}
    </span>
  );
}

export default function V2Roster() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState(null);

  const load = () =>
    fetch('/api/roster-v2', { cache: 'no-store' })
      .then((r) => r.json().then((j) => (r.ok ? setRows(j.athletes) : setError(j.error || 'Could not load.'))))
      .catch(() => setError('Could not load.'));
  useEffect(() => { load(); }, []);

  async function toggle(a) {
    setBusy((b) => ({ ...b, [a.clientId]: true }));
    const res = await fetch(`/api/roster-v2/${a.clientId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ onEngine: !a.onEngine }) });
    if (!res.ok) setError('Could not save.');
    await load();
    setBusy((b) => ({ ...b, [a.clientId]: false }));
  }

  if (!rows) return <div className="bg-white rounded-lg shadow-card border border-border p-5 text-sm text-muted">{error || 'Loading…'}</div>;

  return (
    <div className="bg-white rounded-lg shadow-card border border-border divide-y divide-border">
      {rows.map((a) => (
        <div key={a.clientId} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue truncate">{a.name}</p>
            <div className="flex gap-3 mt-1 flex-wrap">
              <Dot ok={a.consented} label={a.consented ? 'consented' : 'no consent yet'} />
              <Dot ok={a.app} label={a.app ? 'app notifications' : 'no app'} />
              <Dot ok={!!a.chat} label={a.chat ? a.chat : 'no chat channel'} />
            </div>
          </div>
          <button
            role="switch"
            aria-checked={a.onEngine}
            disabled={busy[a.clientId]}
            onClick={() => toggle(a)}
            className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${a.onEngine ? 'bg-red' : 'bg-border'} disabled:opacity-50`}
            title={a.onEngine ? 'On PACT V2' : 'On the classic bot'}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${a.onEngine ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      ))}
      {!rows.length && <p className="px-5 py-4 text-sm text-muted">No athletes yet.</p>}
      {error && <p className="px-5 py-3 text-xs text-red">{error}</p>}
    </div>
  );
}
