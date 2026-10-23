'use client';

/**
 * Needs you today — the top of My Day.
 *
 * 1. Escalations: an athlete said something PAX must not handle alone
 *    (crisis, medical, food/body, distress, pain, wanting to stop). Ranked by
 *    urgency, with their own words. PAX has already sent a safe holding
 *    message; this is the coach's cue to reach out personally.
 * 2. Going quiet: the Cortex's nightly read of each athlete against their own
 *    history says they've gone quiet (logging, replies, check-ins…). Athletes
 *    who go quiet early are the ones who leave later, so the coach hears
 *    first. Message them (via PAX, in the coach's voice) or mark it handled.
 * 3. Drafts: messages PAX wrote but is holding for approval (coach rules →
 *    approval mode). Approve, edit or bin. Nothing reaches the athlete first.
 *
 * Every button writes a coach label in the engine: that's how PACT learns
 * what good coaching looks like to this coach.
 */
import { useState } from 'react';
import Link from 'next/link';
import NudgeTool from '@/components/NudgeTool';
import ProposedMove from '@/components/needs-you/ProposedMove';
import { useNeedsYou, ago, humanAngle, quietSignalLabel, SLOT } from '@/components/needs-you/useNeedsYou';

const TONE = {
  crisis: { bar: 'bg-red', chip: 'bg-red text-white' },
  medical: { bar: 'bg-red', chip: 'bg-red text-white' },
  eating: { bar: 'bg-red', chip: 'bg-red/10 text-red' },
  distress: { bar: 'bg-warn', chip: 'bg-warn-light text-warn-dark' },
  pain: { bar: 'bg-warn', chip: 'bg-warn-light text-warn-dark' },
  quit: { bar: 'bg-blue', chip: 'bg-bg-alt text-blue' },
};

export default function NeedsYouToday() {
  const { data, error, busy, editing, setEditing, linkResult, act, sendConsent } = useNeedsYou();
  const [messaging, setMessaging] = useState({}); // quiet item id → the nudge box is open

  if (!data && !error) {
    return <section className="bg-white rounded-lg shadow-card border border-border p-5 text-sm text-muted">Checking what needs you…</section>;
  }

  const escalations = data?.escalations ?? [];
  const quiet = data?.quiet ?? [];
  const drafts = data?.drafts ?? [];
  const atRisk = data?.atRisk ?? [];
  const needConsent = data?.needConsent ?? [];
  const count = escalations.length + quiet.length + drafts.length + atRisk.length + needConsent.length;
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

      {quiet.map((q) => (
        <div key={q.id} className="relative px-5 py-4 border-b border-border last:border-b-0">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-alt text-blue">going quiet</span>
                <Link href={`/dashboard/clients/${q.clientId}`} className="font-semibold text-blue hover:underline">{q.athlete}</Link>
              </div>
              <p className="text-sm font-semibold text-blue mt-2">{q.headline}</p>
              {q.evidence && <p className="text-xs text-body mt-1">{q.evidence}</p>}
              {q.signals?.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 mt-2 list-none p-0 m-0" aria-label="What moved">
                  {q.signals.map((k) => (
                    <li key={k} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-border text-muted">{quietSignalLabel(k)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                aria-expanded={!!messaging[q.id]}
                onClick={() => setMessaging((m) => ({ ...m, [q.id]: !m[q.id] }))}
                className={`text-xs font-semibold px-3 py-2 rounded border ${messaging[q.id] ? 'border-blue bg-bg-alt text-blue' : 'border-border text-blue hover:border-blue'}`}
              >
                Message
              </button>
              <button disabled={busy[q.id]} onClick={() => act(q.id, { kind: 'escalation', action: 'handled' })} className="text-xs font-semibold px-3 py-2 rounded bg-blue text-white hover:bg-blue-light disabled:opacity-50">
                {busy[q.id] ? 'Saving…' : 'I’ve got this'}
              </button>
            </div>
          </div>
          {q.proposal && (
            <div className="mt-4 border-t border-border pt-4">
              <ProposedMove item={q.proposal} busy={!!busy[q.proposal.id]} act={act} styles={{ btn: 'text-xs font-semibold px-3 py-2 rounded border border-border text-blue hover:border-blue', btnRed: '!bg-red !text-white !border-red hover:!bg-red-deep disabled:opacity-50', btnGhost: '!text-muted hover:!text-red', tag: 'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-alt', textarea: 'mt-2 w-full text-sm text-body border border-border rounded p-3 focus:outline-none focus:border-blue' }} quoteClass="text-sm text-body whitespace-pre-line border-l-2 border-border pl-3" />
            </div>
          )}
          {messaging[q.id] && (
            <div className="mt-4">
              <NudgeTool clientId={q.clientId} clientFirstName={(q.athlete || '').split(' ')[0]} />
            </div>
          )}
        </div>
      ))}

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
          {needConsent.map((a) => {
        const r = linkResult[a.clientId];
        return (
          <div key={`c-${a.clientId}`} className="relative px-5 py-4 border-b border-border last:border-b-0 flex items-start justify-between gap-4">
            <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-alt text-blue">consent needed</span>
                <Link href={`/dashboard/clients/${a.clientId}`} className="font-semibold text-blue hover:underline">{a.athlete}</Link>
              </div>
              <p className="text-sm text-body mt-1.5">PAX can’t message or coach them until they agree to how their data is used.</p>
              {r && (
                <p className="text-xs mt-1.5 text-muted break-all">
                  {r.sent ? 'Link sent on WhatsApp. ' : 'Couldn’t send it automatically. Share this link with them: '}
                  {!r.sent && <span className="text-blue">{r.url}</span>}
                </p>
              )}
            </div>
            <button disabled={busy[a.clientId] || r?.sent} onClick={() => sendConsent(a.clientId)} className="shrink-0 text-xs font-semibold px-3 py-2 rounded bg-blue text-white hover:bg-blue-light disabled:opacity-50">
              {busy[a.clientId] ? 'Sending…' : r?.sent ? 'Sent' : a.canMessage ? 'Send consent link' : 'Get consent link'}
            </button>
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
