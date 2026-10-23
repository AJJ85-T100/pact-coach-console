'use client';

/**
 * What PAX knows about this athlete, with the coach in charge of it.
 *
 *   From your note: facts PAX picked out of the session note just saved.
 *                   Keep puts one in PAX's memory; Bin drops it. Nothing is
 *                   kept until you say so.
 *   From you:       facts PAX treats as true (trusted tier). Remove any.
 *   From {name}:    what PAX picked up from their own messages. PAX treats
 *                   these as unverified; remove anything that's wrong.
 *
 * Through /api/athletes/[id]/memory (engine, as the signed-in coach).
 */
import { useCallback, useEffect, useState } from 'react';
import s from './overview.module.css';

export default function PaxKnows({ clientId, firstName, proposals = [], onProposalsDone }) {
  const [data, setData] = useState(null); // { coach, learned } | 'error'
  const [pending, setPending] = useState(proposals);
  const [busy, setBusy] = useState({});
  const [adding, setAdding] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => { setPending(proposals); }, [proposals]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/athletes/${clientId}/memory`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setData(await r.json());
    } catch {
      setData('error');
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function save(fact, id) {
    setBusy((b) => ({ ...b, [id]: true }));
    setMsg(null);
    try {
      const r = await fetch(`/api/athletes/${clientId}/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fact) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || 'Couldn’t save that. Try again.');
      await load();
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function keep(p) {
    if (await save({ key: p.key, value: p.value }, `p-${p.key}`)) bin(p);
  }

  function bin(p) {
    setPending((list) => {
      const next = list.filter((x) => x.key !== p.key);
      if (!next.length) onProposalsDone?.();
      return next;
    });
  }

  async function remove(key) {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await fetch(`/api/athletes/${clientId}/memory/${encodeURIComponent(key)}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function add(e) {
    e.preventDefault();
    const value = adding.trim();
    if (value.length < 2) return;
    if (await save({ value }, 'add')) setAdding('');
  }

  const btn = 'min-h-[40px] px-3 text-[13px] font-semibold border';
  return (
    <section className={s.card} aria-labelledby="pax-knows" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 id="pax-knows" className={s.h} style={{ fontSize: 15 }}>What PAX knows about {firstName}</h2>
        <p className="mt-1 mb-0 text-[13px] text-[#5B6B7F]">PAX uses these in every message. Your recent notes count too, for three weeks (session notes for a month).</p>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-2 p-3 bg-bg border border-border" role="region" aria-label="Facts from your note">
          <p className="m-0 text-[13px] font-semibold text-blue">From your note. Keep the ones PAX should remember:</p>
          {pending.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] text-blue min-w-0" style={{ overflowWrap: 'anywhere' }}>{p.value}</span>
              <span className="flex gap-2">
                <button type="button" disabled={busy[`p-${p.key}`]} onClick={() => keep(p)} className={`${btn} bg-blue text-white border-blue disabled:opacity-50`}>
                  {busy[`p-${p.key}`] ? 'Saving…' : 'Keep'}
                </button>
                <button type="button" onClick={() => bin(p)} className={`${btn} bg-white text-blue border-border hover:border-blue`}>Bin</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {data === null ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Loading…</p>
      ) : data === 'error' ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Couldn’t load this just now.</p>
      ) : (
        <>
          <FactList title="From you" empty={`Nothing yet. Add what PAX should always keep in mind about ${firstName}.`} rows={data.coach} busy={busy} onRemove={remove} />
          {data.learned?.length > 0 && (
            <FactList title={`Picked up from ${firstName}’s messages`} hint="Unverified. Remove anything that’s wrong." rows={data.learned} busy={busy} onRemove={remove} />
          )}
        </>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2 border-t border-border pt-3">
        <label htmlFor="pax-add" className="sr-only">Add a fact</label>
        <input
          id="pax-add"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          maxLength={200}
          placeholder="e.g. Works nights on Fridays, so no Saturday mornings"
          className="flex-1 min-w-[220px] min-h-[44px] px-3 bg-bg border border-border text-[14px] text-blue focus:outline-none focus:border-blue"
        />
        <button type="submit" disabled={busy.add || adding.trim().length < 2} className="min-h-[44px] px-4 bg-red text-white text-[14px] font-semibold disabled:opacity-40">
          {busy.add ? 'Adding…' : 'Add'}
        </button>
      </form>
      {msg && <p role="alert" className="m-0 text-[13px] text-[#B42318]">{msg}</p>}
    </section>
  );
}

function FactList({ title, hint, empty, rows, busy, onRemove }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-[#5B6B7F]">{title}</p>
      {hint && <p className="m-0 -mt-1 text-[12px] text-[#5B6B7F]">{hint}</p>}
      {!rows?.length ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">{empty}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-blue min-w-0" style={{ overflowWrap: 'anywhere' }}>{r.value}</span>
              <button type="button" disabled={busy[r.key]} onClick={() => onRemove(r.key)} className="shrink-0 min-h-[40px] px-2 text-[13px] text-[#5B6B7F] hover:text-red disabled:opacity-50">
                {busy[r.key] ? '…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
