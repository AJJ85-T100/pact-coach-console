'use client';

/**
 * Do this next — the athlete page's slice of Needs you today: this athlete's
 * open escalations, the Cortex's going-quiet flag (GoingQuiet) and PAX drafts
 * awaiting approval (plus a consent link if PAX can't coach them yet). Same
 * data and the same engine actions as NeedsYouToday, via useNeedsYou, so
 * every button writes a coach_labels row.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNeedsYou, ago, humanAngle, SLOT } from '@/components/needs-you/useNeedsYou';
import GoingQuiet from './GoingQuiet';
import ProposedMove from '@/components/needs-you/ProposedMove';
import s from './overview.module.css';

const ESC_COLOR = { crisis: '#B42318', medical: '#B42318', eating: '#B42318', distress: '#B54708', pain: '#B54708', quit: '#0A2540' };

export default function DoThisNext({ clientId, firstName, conversationHref }) {
  const router = useRouter();
  const { data, error, busy, editing, setEditing, linkResult, act, sendConsent } = useNeedsYou({ onDone: () => router.refresh() });

  const mine = (list) => (list || []).filter((x) => x.clientId === clientId);
  const escalations = mine(data?.escalations);
  const quiet = mine(data?.quiet)[0] || null;
  // The Cortex's proposed move: on the quiet item, or on its own once the flag is handled.
  const proposal = quiet?.proposal || mine(data?.moves)[0] || null;
  const drafts = mine(data?.drafts);
  const consent = mine(data?.needConsent)[0] || null;
  const drift = mine(data?.atRisk)[0] || null;
  const count = escalations.length + (quiet ? 1 : 0) + (proposal && !quiet ? 1 : 0) + drafts.length + (consent ? 1 : 0);
  const loading = !data && !error;
  const name = firstName || 'this athlete';

  if (loading) {
    return (
      <section className={s.card} aria-busy="true" style={{ fontSize: 14, color: '#5B6B7F' }}>
        Checking what needs you for {name}…
      </section>
    );
  }

  if (count === 0) {
    return (
      <section className={s.card} aria-labelledby="ov-next" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 id="ov-next" className={s.h} style={{ fontSize: 18 }}>Nothing needs you for {name}</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#5B6B7F', lineHeight: 1.5 }}>
          {error
            ? 'Couldn’t reach PAX just now, so this may be out of date. Try again in a minute.'
            : drift
              ? `PAX is handling the day. Worth knowing: ${drift.reasons.join(' · ').toLowerCase()}.`
              : 'PAX is handling the day. Drafts and anything it shouldn’t handle alone will show up here first.'}
        </p>
      </section>
    );
  }

  const label = escalations.length
    ? 'Needs you personally'
    : quiet
      ? (proposal ? 'Going quiet · a move to approve' : 'Going quiet')
      : proposal
        ? 'A move to approve'
      : drafts.length
        ? `PAX draft${drafts.length > 1 ? 's' : ''} · waiting for your approval`
        : 'Consent needed';
  // A quiet flag on its own is a signal to act on, not an alarm: the card
  // keeps the brand blue rather than the red alert border.
  const quietOnly = count === 1 && !!(quiet || proposal);

  return (
    <section className={`${s.card} ${quietOnly ? s.cardQuiet : s.cardAlert}`} aria-labelledby="ov-next" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h2 id="ov-next" className={s.h} style={{ fontSize: 18 }}>Do this next</h2>
        <p className={s.lbl} style={{ color: quietOnly ? '#0A2540' : '#B42318' }}>{label}</p>
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B42318' }}>{error}</p>}
      {drift && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#0A2540' }}>{drift.reasons.join('. ')}.</p>}

      {escalations.map((e) => (
        <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #EEF1F5', paddingTop: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: '#5B6B7F' }}>
            <span className={s.tag} style={{ color: ESC_COLOR[e.category] || '#0A2540' }}>{e.category}</span>
            <span>{ago(e.at)}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0A2540' }}>{e.headline}{e.area ? ` (${e.area})` : ''}</p>
          {e.message && <blockquote className={s.quote}>“{e.message}”</blockquote>}
          <p style={{ margin: 0, fontSize: 13, color: '#5B6B7F' }}>PAX sent a holding message and won’t coach on this. Reach out yourself.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className={`${s.btn} ${s.btnBlue}`} disabled={busy[e.id]} onClick={() => act(e.id, { kind: 'escalation', action: 'handled' })}>
              {busy[e.id] ? 'Saving…' : 'I’ve handled it'}
            </button>
            {conversationHref && <Link href={conversationHref} className={`${s.btn} ${s.btnGhost}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Open conversation</Link>}
          </div>
        </div>
      ))}

      {quiet && (
        <GoingQuiet
          item={quiet}
          busy={!!busy[quiet.id]}
          onHandled={() => act(quiet.id, { kind: 'escalation', action: 'handled' })}
          conversationHref={conversationHref}
        />
      )}

      {proposal && (
        <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 14 }}>
          <ProposedMove item={proposal} busy={!!busy[proposal.id]} act={act} styles={s} quoteClass={s.quote} />
        </div>
      )}

      {drafts.map((d) => {
        const isEditing = editing[d.id] !== undefined;
        return (
          <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #EEF1F5', paddingTop: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: '#5B6B7F' }}>
              <span className={s.tag} style={{ color: '#0A2540' }}>{SLOT[d.slot] ?? humanAngle(d.slot)} draft</span>
              <span>{ago(d.at)}</span>
              {d.why?.length > 0 && <span>· about: {d.why.map(humanAngle).join(', ')}</span>}
            </div>
            {isEditing ? (
              <textarea
                aria-label="Edit the message"
                className={s.textarea}
                rows={4}
                value={editing[d.id]}
                onChange={(ev) => setEditing((x) => ({ ...x, [d.id]: ev.target.value }))}
              />
            ) : (
              <blockquote className={s.quote}>“{d.message}”</blockquote>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {isEditing ? (
                <>
                  <button className={`${s.btn} ${s.btnRed}`} disabled={busy[d.id] || !editing[d.id]?.trim()} onClick={() => act(d.id, { kind: 'draft', action: 'edit', text: editing[d.id] })}>
                    {busy[d.id] ? 'Sending…' : 'Send my version'}
                  </button>
                  <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setEditing((x) => ({ ...x, [d.id]: undefined }))}>Cancel</button>
                </>
              ) : (
                <>
                  <button className={`${s.btn} ${s.btnRed}`} disabled={busy[d.id]} onClick={() => act(d.id, { kind: 'draft', action: 'approve' })}>
                    {busy[d.id] ? 'Sending…' : 'Approve and send'}
                  </button>
                  <button className={s.btn} disabled={busy[d.id]} onClick={() => setEditing((x) => ({ ...x, [d.id]: d.message }))}>Edit</button>
                  <button className={`${s.btn} ${s.btnGhost}`} disabled={busy[d.id]} onClick={() => act(d.id, { kind: 'draft', action: 'reject' })}>Don’t send</button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {consent && (() => {
        const r = linkResult[clientId];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #EEF1F5', paddingTop: 14 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: '#0A2540' }}>
              PAX can’t message or coach {name} until they agree to how their data is used. Only {name} can give consent.
            </p>
            {r && (
              <p style={{ margin: 0, fontSize: 13, color: '#5B6B7F', wordBreak: 'break-all' }}>
                {r.sent ? 'Link sent.' : <>Couldn’t send it automatically. Share this link with them: <span style={{ color: '#0A2540' }}>{r.url}</span></>}
              </p>
            )}
            <div>
              <button className={`${s.btn} ${s.btnBlue}`} disabled={busy[clientId] || r?.sent} onClick={() => sendConsent(clientId)}>
                {busy[clientId] ? 'Sending…' : r?.sent ? 'Sent' : consent.canMessage ? 'Send consent link' : 'Get consent link'}
              </button>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
