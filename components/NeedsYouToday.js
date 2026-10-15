'use client';

/**
 * Needs you today — the top of My Day.
 *
 * 1. Escalations: an athlete said something PAX must not handle alone
 *    (crisis, medical, food/body, distress, pain, wanting to stop). Ranked by
 *    urgency, with their own words. PAX has already sent a safe holding
 *    message; this is the coach's cue to reach out personally.
 * 2. Drafts: messages PAX wrote but is holding for approval (coach rules →
 *    approval mode). Approve, edit or bin. Nothing reaches the athlete first.
 *
 * Every button writes a coach label in the engine: that's how PACT learns
 * what good coaching looks like to this coach.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const TONE = {
  crisis: { bar: 'bg-red', chip: 'bg-red text-white' },
  medical: { bar: 'bg-red', chip: 'bg-red text-white' },
  eating: { bar: 'bg-red', chip: 'bg-red/10 text-red' },
  distress: { bar: 'bg-warn', chip: 'bg-warn-light text-warn-dark' },
  pain: { bar: 'bg-warn', chip: 'bg-warn-light text-warn-dark' },
  quit: { bar: 'bg-blue', chip: 'bg-bg-alt text-blue' },
};

const SLOT = { morning: 'Morning', midday: 'Midday', evening: 'Evening' };

function ago(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function humanAngle(a) {
  return a.replace(/_/g, ' ');
}

export default function NeedsYouToday() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  const [editing, setEditing] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/needs-you', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id, body) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/needs-you/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setEditing((e) => ({ ...e, [id]: undefined }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  if (!data && !error) {
    return <section className="bg-white rounded-lg shadow-card border border-border p-5 text-sm text-muted">Checking what needs you…</section>;
  }

  const escalations = data?.escalations ?? [];
  const drafts = data?.drafts ?? [];
  const atRisk = data?.atRisk ?? [];
  const count = escalations.length + drafts.length + atRisk.length;
  const empty = count === 0;

  return (
    <section className="bg-white rounded-lg shadow-card border border-border overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-red">Needs you today</p>
          <h2 className="font-display font-extrabold text-blue text-lg leading-tight mt-1">
            {empty ? 'Nothing waiting on you.' : `${count} thing${count === 1 ? '' : 's'} waiting on you`}
          </h2>
        </div>
        {error && <span className="text-xs text-red">{error}</span>}
      </header>

      {empty && !error && (
        <p className="px-5 py-4 text-sm text-body">PAX is handling the day. Anything it shouldn’t handle alone will show up here first.</p>
      )}

      {escalations.map((e) => {
        const tone = TONE[e.category] ?? TONE.quit;
        return (
          <div key={e.id} className="relative px-5 py-4 border-b border-border last:border-b-0">
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`} aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${tone.chip}`}>{e.category}</span>
                  <Link href={`/dashboard/clients/${e.clientId}`} className="font-semibold text-blue hover:underline">{e.athlete}</Link>
                  <span className="text-xs text-muted">{ago(e.at)}</span>
                </div>
                <p className="text-sm font-semibold text-blue mt-2">{e.headline}{e.area ? ` (${e.area})` : ''}</p>
                {e.message && <p className="text-sm text-body mt-1 italic">“{e.message}”</p>}
                <p className="text-xs text-muted mt-2">PAX sent a holding message and won’t coach on this. Reach out yourself.</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Link href={`/dashboard/clients/${e.clientId}`} className="text-xs font-semibold text-center px-3 py-2 rounded border border-border text-blue hover:border-blue">Open athlete</Link>
                <button disabled={busy[e.id]} onClick={() => act(e.id, { kind: 'escalation', action: 'handled' })} className="text-xs font-semibold px-3 py-2 rounded bg-blue text-white hover:bg-blue-light disabled:opacity-50">
                  {busy[e.id] ? 'Saving…' : 'I’ve handled it'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {drafts.map((d) => {
        const isEditing = editing[d.id] !== undefined;
        return (
          <div key={d.id} className="px-5 py-4 border-b border-border last:border-b-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-alt text-blue">{SLOT[d.slot] ?? d.slot} draft</span>
              <Link href={`/dashboard/clients/${d.clientId}`} className="font-semibold text-blue hover:underline">{d.athlete}</Link>
              <span className="text-xs text-muted">{ago(d.at)}</span>
              {d.why?.length > 0 && <span className="text-xs text-muted">· about: {d.why.map(humanAngle).join(', ')}</span>}
            </div>
            {isEditing ? (
              <textarea
                value={editing[d.id]}
                onChange={(ev) => setEditing((e) => ({ ...e, [d.id]: ev.target.value }))}
                rows={4}
                className="mt-2 w-full text-sm text-body border border-border rounded p-3 focus:outline-none focus:border-blue"
              />
            ) : (
              <p className="mt-2 text-sm text-body whitespace-pre-line border-l-2 border-border pl-3">{d.message}</p>
            )}
            <div className="flex gap-2 mt-3">
              {isEditing ? (
                <>
                  <button disabled={busy[d.id] || !editing[d.id]?.trim()} onClick={() => act(d.id, { kind: 'draft', action: 'edit', text: editing[d.id] })} className="text-xs font-semibold px-3 py-2 rounded bg-red text-white hover:bg-red-deep disabled:opacity-50">
                    {busy[d.id] ? 'Sending…' : 'Send my version'}
                  </button>
                  <button onClick={() => setEditing((e) => ({ ...e, [d.id]: undefined }))} className="text-xs font-semibold px-3 py-2 rounded border border-border text-muted">Cancel</button>
                </>
              ) : (
                <>
                  <button disabled={busy[d.id]} onClick={() => act(d.id, { kind: 'draft', action: 'approve' })} className="text-xs font-semibold px-3 py-2 rounded bg-red text-white hover:bg-red-deep disabled:opacity-50">
                    {busy[d.id] ? 'Sending…' : 'Approve & send'}
                  </button>
                  <button onClick={() => setEditing((e) => ({ ...e, [d.id]: d.message }))} className="text-xs font-semibold px-3 py-2 rounded border border-border text-blue hover:border-blue">Edit</button>
                  <button disabled={busy[d.id]} onClick={() => act(d.id, { kind: 'draft', action: 'reject' })} className="text-xs font-semibold px-3 py-2 rounded border border-border text-muted hover:text-red">Don’t send</button>
                </>
              )}
            </div>
          </div>
        );
      })}
          {atRisk.map((a) => (
        <div key={a.clientId} className="relative px-5 py-4 border-b border-border last:border-b-0 flex items-start justify-between gap-4">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-warn" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-warn-light text-warn-dark">drifting</span>
              <Link href={`/dashboard/clients/${a.clientId}`} className="font-semibold text-blue hover:underline">{a.athlete}</Link>
            </div>
            <p className="text-sm text-body mt-1.5">{a.reasons.join(' · ')}</p>
          </div>
          <Link href={`/dashboard/clients/${a.clientId}`} className="shrink-0 text-xs font-semibold text-center px-3 py-2 rounded border border-border text-blue hover:border-blue">Open athlete</Link>
        </div>
      ))}
    </section>
  );
}
