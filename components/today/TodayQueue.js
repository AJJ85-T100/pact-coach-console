'use client';

/**
 * Today — the header count and the coach's queue: Escalations, Drafts
 * (with a bulk approve for routine ones), Drifting and Consent needed.
 * NeedsYouToday restyled to the Today mockup; same data and the same engine
 * actions (useNeedsYou → /api/needs-you/[id]), so every button writes a
 * coach_labels row. Coaches can send a consent link; they never record consent.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ago, humanAngle, SLOT, quietSignalLabel } from '@/components/needs-you/useNeedsYou';
import ProposedMove from '@/components/needs-you/ProposedMove';
import { useToday } from './TodayContext';
import s from './today.module.css';

const ESC_COLOR = { crisis: '#B42318', medical: '#B42318', eating: '#B42318', distress: '#B54708', pain: '#B54708', quit: '#0A2540' };
const href = (id) => `/dashboard/clients/${id}`;

export function TodayHeader({ dateLabel, sentOwn }) {
  const { count, error } = useToday();
  const title = count == null
    ? (error ? 'Today' : 'Checking what needs you…')
    : count === 0 ? 'Nothing needs you' : `${count} thing${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} you`;
  const sub = `PAX handled ${sentOwn} message${sentOwn === 1 ? '' : 's'} on its own today.${count ? ' Clear this list and you’re done.' : ''}`;
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className={s.lbl} style={{ color: '#D92D20' }}>{dateLabel}</p>
      <h1 className={s.h} style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1 }} aria-live="polite">{title}</h1>
      <p style={{ margin: 0, fontSize: 15, color: '#5B6B7F' }}>{sub}</p>
      {error && count == null && <p className={s.err} role="alert">Couldn’t reach PAX just now, so the list below may be incomplete.</p>}
    </header>
  );
}

function Count({ n, color }) {
  return <span className={s.count} style={color ? { background: color } : undefined}>{n}</span>;
}

export function Escalations() {
  const { data, busy, act } = useToday();
  const list = data?.escalations || [];
  if (!list.length) return null;
  return (
    <section className={`${s.card} ${s.cardAlert}`} aria-labelledby="t-esc">
      <h2 id="t-esc" className={s.h2}>Escalations <Count n={list.length} color="#D92D20" /></h2>
      <p className={s.why} style={{ marginTop: 4 }}>PAX never answers these. A human reply is needed.</p>
      {list.map((e) => (
        <div key={e.id} className={s.item}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Link className={s.who} href={href(e.clientId)}>{e.athlete}</Link>
              <span className={s.tag} style={{ color: ESC_COLOR[e.category] || '#0A2540' }}>{e.category}</span>
              <span className={s.why} style={{ margin: 0 }}>{ago(e.at)}</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600 }}>{e.headline}{e.area ? ` (${e.area})` : ''}</p>
            {e.message && <p className={`${s.draft} ${s.draftAlert}`}>“{e.message}”</p>}
            <p className={s.why} style={{ marginTop: 6 }}>PAX sent a holding message and won’t coach on this. Reach out yourself.</p>
          </div>
          <div className={s.acts}>
            <Link className={`${s.btn} ${s.btnRed}`} href={`${href(e.clientId)}?tab=messages&compose=1`}>Reply</Link>
            <button className={`${s.btn} ${s.btnGhost}`} disabled={busy[e.id]} onClick={() => act(e.id, { kind: 'escalation', action: 'handled' })}>
              {busy[e.id] ? 'Saving…' : 'Mark handled'}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Going quiet, with no proposed move: the engine's nightly flag on its own.
 * "I've got this" clears it through the same engine route as an escalation
 * (writes the coach_labels row). Neutral colour: a signal, not a fault.
 */
export function GoingQuiet() {
  const { quietOnly, busy, act } = useToday();
  if (!quietOnly?.length) return null;
  return (
    <section className={s.card} aria-labelledby="t-quiet">
      <h2 id="t-quiet" className={s.h2}>Going quiet <Count n={quietOnly.length} /></h2>
      <p className={s.why} style={{ marginTop: 4 }}>Less active than usual for them. A word from you now usually brings them back.</p>
      {quietOnly.map((q) => (
        <div key={q.id} className={s.item}>
          <div style={{ minWidth: 0 }}>
            <Link className={s.who} href={href(q.clientId)}>{q.athlete}</Link>
            <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 600 }}>{q.headline}</p>
            {q.evidence && <p className={s.why}>{q.evidence}</p>}
            {q.signals?.length > 0 && <p className={s.why}>{q.signals.map(quietSignalLabel).join(' · ')}</p>}
          </div>
          <div className={s.acts}>
            <Link className={`${s.btn} ${s.btnRed}`} href={`${href(q.clientId)}?tab=messages&compose=1`}>Message</Link>
            <button className={`${s.btn} ${s.btnGhost}`} disabled={busy[q.id]} onClick={() => act(q.id, { kind: 'escalation', action: 'handled' })}>
              {busy[q.id] ? 'Saving…' : 'I’ve got this'}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Proposed moves — the Cortex's one move a night for each athlete going
 * quiet, held for the coach. Approve, edit or bin; nothing reaches the
 * athlete first. Two asks with nothing back make the next one a note in the
 * coach's own name.
 */
export function Moves() {
  const { data, busy, act, error } = useToday();
  const list = data?.moves || [];
  if (!list.length) return null;
  const quietBy = Object.fromEntries((data?.quiet || []).map((q) => [q.clientId, q]));
  return (
    <section className={s.card} aria-labelledby="t-moves">
      <h2 id="t-moves" className={s.h2}>Going quiet · a message ready for you <Count n={list.length} /></h2>
      <p className={s.why} style={{ marginTop: 4 }}>PAX has written one message for each, based on what has worked for them before. Nothing goes out until you send it.</p>
      {error && <p className={s.err} role="alert">{error}</p>}
      {list.map((m, i) => {
        const q = quietBy[m.clientId];
        return (
          <div key={m.id} className={s.item} style={{ animationDelay: `${0.05 + i * 0.07}s`, display: 'block' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Link className={s.who} href={href(m.clientId)}>{m.athlete}</Link>
              {q && <span className={s.why} style={{ margin: 0 }}>{q.headline}{q.evidence ? ` · ${q.evidence}` : ''}</span>}
              {!q && <span className={s.why} style={{ margin: 0 }}>{ago(m.at)}</span>}
            </div>
            <ProposedMove item={m} busy={!!busy[m.id]} act={act} styles={s} quoteClass={s.draft} />
          </div>
        );
      })}
    </section>
  );
}

export function Drafts() {
  const { data, busy, editing, setEditing, act, autonomy, error } = useToday();
  const [bulk, setBulk] = useState(null);
  const list = data?.drafts || [];
  if (!list.length) return null;

  // Routine = every angle on the draft is one this coach approves unchanged
  // nearly every time (engine autonomy stats). Escalations are never drafts.
  // No autonomy data → no bulk button.
  const isRoutine = (d) => autonomy.status === 'ok' && d.why?.length > 0 && d.why.every((a) => autonomy.routine.has(a));
  const routine = list.filter(isRoutine);

  async function approveRoutine() {
    const ids = routine.map((d) => d.id);
    setBulk({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      // One engine call per draft: each is claimed, sent and labelled 'approved'.
      await act(ids[i], { kind: 'draft', action: 'approve' });
      setBulk({ done: i + 1, total: ids.length });
    }
    setBulk(null);
  }

  return (
    <section className={s.card} aria-labelledby="t-drafts">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2 id="t-drafts" className={s.h2}>Drafts to approve <Count n={list.length} /></h2>
        {routine.length > 1 && (
          <button className={`${s.btn} ${s.btnBlue}`} disabled={!!bulk} onClick={approveRoutine}>
            {bulk ? `Sending ${bulk.done} of ${bulk.total}…` : `Approve ${routine.length} routine drafts`}
          </button>
        )}
      </div>
      {error && <p className={s.err} role="alert">{error}</p>}
      {list.map((d, i) => {
        const isEditing = editing[d.id] !== undefined;
        const r = isRoutine(d);
        const about = d.why?.length ? d.why.map((a) => autonomy.labelOf(a)).join(', ') : null;
        return (
          <div key={d.id} className={s.item} style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Link className={s.who} href={href(d.clientId)}>{d.athlete}</Link>
                <span className={s.tag} style={{ color: r ? '#5B6B7F' : '#B42318' }}>{r ? 'Routine' : (SLOT[d.slot] ?? humanAngle(d.slot))}</span>
                <span className={s.why} style={{ margin: 0 }}>{[about, ago(d.at)].filter(Boolean).join(' · ')}</span>
              </div>
              {isEditing ? (
                <textarea
                  aria-label={`Edit the message to ${d.athlete}`}
                  className={s.textarea}
                  rows={4}
                  value={editing[d.id]}
                  onChange={(ev) => setEditing((x) => ({ ...x, [d.id]: ev.target.value }))}
                />
              ) : (
                <p className={s.draft}>“{d.message}”</p>
              )}
            </div>
            <div className={s.acts}>
              {isEditing ? (
                <>
                  <button className={`${s.btn} ${s.btnRed}`} disabled={busy[d.id] || !editing[d.id]?.trim()} onClick={() => act(d.id, { kind: 'draft', action: 'edit', text: editing[d.id] })}>
                    {busy[d.id] ? 'Sending…' : 'Send my version'}
                  </button>
                  <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setEditing((x) => ({ ...x, [d.id]: undefined }))}>Cancel</button>
                </>
              ) : (
                <>
                  <button className={`${s.btn} ${s.btnRed}`} disabled={busy[d.id] || !!bulk} onClick={() => act(d.id, { kind: 'draft', action: 'approve' })}>
                    {busy[d.id] ? 'Sending…' : 'Approve'}
                  </button>
                  <button className={s.btn} disabled={busy[d.id] || !!bulk} onClick={() => setEditing((x) => ({ ...x, [d.id]: d.message }))}>Edit</button>
                  <button className={`${s.btn} ${s.btnGhost}`} disabled={busy[d.id] || !!bulk} onClick={() => act(d.id, { kind: 'draft', action: 'reject' })}>Bin</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function Drifting() {
  const { driftList } = useToday();
  if (!driftList.length) return null;
  return (
    <section className={s.card} aria-labelledby="t-drift">
      <h2 id="t-drift" className={s.h2}>Drifting <Count n={driftList.length} /></h2>
      {driftList.map((a, i) => {
        const color = a.score == null ? '#D92D20' : a.score >= 70 ? '#D92D20' : '#E07A00';
        const ink = a.score == null ? '#B42318' : a.score >= 70 ? '#B42318' : '#B54708';
        return (
          <div key={a.clientId} className={s.item} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
            <div style={{ minWidth: 0 }}>
              <Link className={s.who} href={href(a.clientId)}>{a.athlete}</Link>
              {a.reason && <p className={s.why}>{a.reason}</p>}
              {a.score != null && (
                <div className={s.risk} style={{ marginTop: 8 }} role="img" aria-label={`Slip risk ${a.score} out of 100`}>
                  <div className={s.riskf} style={{ width: `${a.score}%`, background: color, animationDelay: `${0.3 + i * 0.08}s` }} />
                </div>
              )}
            </div>
            {a.score != null && (
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 20, color: ink }} aria-hidden="true">{a.score}</div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function ConsentNeeded() {
  const { data, busy, linkResult, sendConsent } = useToday();
  const list = data?.needConsent || [];
  if (!list.length) return null;
  return (
    <section className={s.card} aria-labelledby="t-consent">
      <h2 id="t-consent" className={s.h2}>Consent needed <Count n={list.length} /></h2>
      <p className={s.why} style={{ marginTop: 4 }}>PAX can’t message them until they agree. Only the athlete can give consent.</p>
      {list.map((a) => {
        const r = linkResult[a.clientId];
        return (
          <div key={a.clientId} className={s.item}>
            <div style={{ minWidth: 0 }}>
              <Link className={s.who} href={href(a.clientId)}>{a.athlete}</Link>
              {r && (
                <p className={s.why} style={{ wordBreak: 'break-all' }}>
                  {r.sent ? 'Link sent.' : <>Couldn’t send it automatically. Share this link with them: <span style={{ color: '#0A2540' }}>{r.url}</span></>}
                </p>
              )}
            </div>
            <div className={s.acts}>
              <button className={s.btn} disabled={busy[a.clientId] || r?.sent} onClick={() => sendConsent(a.clientId)}>
                {busy[a.clientId] ? 'Sending…' : r?.sent ? 'Sent' : a.canMessage ? 'Send consent link' : 'Get consent link'}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Shown in place of the queue when there's nothing in it. */
export function QueueClear() {
  const { data, driftList, count } = useToday();
  if (!data) {
    return <section className={s.card} aria-busy="true" style={{ fontSize: 14, color: '#5B6B7F' }}>Checking what needs you…</section>;
  }
  if (count !== 0 || driftList.length) return null;
  return (
    <section className={s.card}>
      <h2 className={s.h2}>All clear</h2>
      <p className={s.why} style={{ marginTop: 6 }}>PAX is handling the day. Anything it shouldn’t handle alone will show up here first.</p>
    </section>
  );
}

/** "Let PAX send these on its own" — engine autonomy suggestions. Hidden if the engine route isn't there. */
export function AutonomyCard() {
  const { autonomy } = useToday();
  if (autonomy.status !== 'ok') return null;
  const { suggestions, angles, labelOf, dismiss, setAngleAuto, busy, msg } = autonomy;
  const edits = [...angles].filter((a) => (a.edited || 0) > 0).sort((a, b) => b.edited - a.edited).slice(0, 3);
  if (!suggestions.length && !edits.length && !msg) return null;
  const span = autonomy.days ? `Last ${autonomy.days} days` : null;

  return (
    <section className={s.card} aria-labelledby="t-auto">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h2 id="t-auto" className={s.h2}>Messages you always approve</h2>
        {span && <p className={s.lbl}>{span}</p>}
      </div>
      {suggestions.length === 0 ? (
        <p className={s.why} style={{ marginTop: 6 }}>Nothing to hand over yet. Keep approving and PAX will suggest the ones you never change.</p>
      ) : (
        <>
          <p className={s.why} style={{ marginTop: 4 }}>You almost never change these. Let PAX send them without asking; you’ll still see every one in the log below.</p>
          {suggestions.map((a, i) => {
            const decided = (a.approved || 0) + (a.edited || 0) + (a.rejected || 0);
            return (
              <div key={a.angle} className={s.item} style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{a.label || labelOf(a.angle)}</p>
                  <p className={s.why}>You approved {a.approvedUnchanged || 0} of {decided} {a.label || labelOf(a.angle)} unchanged.</p>
                </div>
                <div className={s.acts}>
                  {!a.locked && (
                    <button className={`${s.btn} ${s.btnBlue}`} disabled={busy[a.angle]} onClick={() => setAngleAuto(a.angle, true)}>
                      {busy[a.angle] ? 'Saving…' : 'Send automatically'}
                    </button>
                  )}
                  <button className={`${s.btn} ${s.btnGhost}`} disabled={busy[a.angle]} onClick={() => dismiss(a.angle)}>Keep reviewing</button>
                </div>
              </div>
            );
          })}
        </>
      )}
      {msg && <p className={s.err} role="alert">{msg}</p>}
      {edits.length > 0 && (
        <p className={s.why} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EEF1F5' }}>
          <strong style={{ color: '#0A2540' }}>Your edits:</strong>{' '}
          {edits.map((a) => `${a.label || labelOf(a.angle)} (${a.edited})`).join(' · ')}
        </p>
      )}
    </section>
  );
}

/**
 * What PAX sent on its own today — collapsed, grouped by angle in time order.
 * groups: from lib/today/derive groupAutoLog(); labels come from the engine.
 */
const TYPE_LABEL = {
  morning: 'Morning briefs', midday: 'Midday check-ins', evening: 'Evening wraps', slip_checkin: 'Slip check-ins',
  nudge: 'Nudges', milestone: 'Milestones', weekly_report: 'Weekly wraps', reply: 'Chat replies',
};

export function AutoLog({ groups, total }) {
  const { autonomy } = useToday();
  return (
    <section className={s.card}>
      <details className={s.details}>
        <summary>
          <h2 className={s.h2}>What PAX sent on its own today <Count n={total} color="#5B6B7F" /></h2>
          <span className={s.showHide} aria-hidden="true" />
        </summary>
        {groups.length === 0 ? (
          <p className={s.why} style={{ paddingTop: 10 }}>Nothing yet today.</p>
        ) : (
          groups.map((g) => {
            const label = g.angle ? autonomy.labelOf(g.angle) : (TYPE_LABEL[g.type] || humanAngle(g.type));
            const names = g.athletes.slice(0, 6);
            return (
              <div key={g.key} className={s.log}>
                <span className={s.lbl} style={{ fontSize: 10 }}>{g.from === g.to ? g.from : `${g.from}–${g.to}`}</span>
                <span>
                  <strong>{label}</strong>
                  {g.count > 1 && ` ×${g.count}`} to{' '}
                  {names.map((a, i) => (
                    <span key={a.clientId}>{i > 0 && ', '}<Link href={href(a.clientId)}>{a.athlete}</Link></span>
                  ))}
                  {g.athletes.length > names.length && ` and ${g.athletes.length - names.length} more`}
                </span>
              </div>
            );
          })
        )}
      </details>
    </section>
  );
}
