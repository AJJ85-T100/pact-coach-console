'use client';

/**
 * ProposedMove — one move the Cortex proposes for an athlete going quiet
 * (engine needs-you `moves`, or `quiet[].proposal`): the move in a coach's
 * words, why this one (the record behind it, pooled across the roster with
 * this athlete's own on top), PAX's draft, and the decision. Approve sends
 * it as it is; Edit sends the coach's words; "Not this one" bins it. Nothing
 * reaches the athlete until one of those is pressed. Two unanswered asks in
 * a row make the proposal a note in the coach's own name (coachTouch).
 *
 * Styling comes from the caller (today.module.css or overview.module.css):
 * `styles` holds btn / btnRed / btnGhost / tag / textarea, `quoteClass` the
 * draft's class. Actions go through useNeedsYou's `act` (→ /api/needs-you/[id]
 * → the engine's drafts route), which writes the coach_labels row.
 */
import { useState } from 'react';

const ASK = { none: 'no ask', small: 'a small ask', medium: 'a medium ask', large: 'a big ask' };

export default function ProposedMove({ item, busy, act, styles, quoteClass, showAthlete = false, athleteHref }) {
  const [text, setText] = useState(null); // null = not editing
  if (!item) return null;
  const editing = text !== null;
  const send = item.coachTouch ? 'Send in my name' : 'Approve and send';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: '#5B6B7F' }}>
        <span className={styles.tag} style={{ color: item.coachTouch ? '#D92D20' : '#0A2540' }}>{item.coachTouch ? 'Your turn' : 'Proposed move'}</span>
        {showAthlete && item.athlete && (
          athleteHref ? <a href={athleteHref} style={{ fontWeight: 700, color: '#0A2540', textDecoration: 'none' }}>{item.athlete}</a> : <span style={{ fontWeight: 700, color: '#0A2540' }}>{item.athlete}</span>
        )}
        {item.dose && <span>Move {Math.min(item.dose.week + 1, item.dose.cap)} of {item.dose.cap} this week</span>}
        {item.askSize && <span>· {ASK[item.askSize] || item.askSize}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0A2540' }}>{item.summary || item.label}</p>
      {item.why?.length > 0 && (
        <ul aria-label="Why this move" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: '#5B6B7F' }}>
          {item.why.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {editing ? (
        <textarea
          aria-label={`Edit the message${item.athlete ? ` to ${item.athlete}` : ''}`}
          className={styles.textarea}
          rows={4}
          value={text}
          onChange={(ev) => setText(ev.target.value)}
        />
      ) : (
        <blockquote className={quoteClass} style={{ margin: 0 }}>“{item.message}”</blockquote>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {editing ? (
          <>
            <button className={`${styles.btn} ${styles.btnRed}`} disabled={busy || !text.trim()} onClick={() => act(item.id, { kind: 'draft', action: 'edit', text })}>
              {busy ? 'Sending…' : 'Send my version'}
            </button>
            <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setText(null)}>Cancel</button>
          </>
        ) : (
          <>
            <button className={`${styles.btn} ${styles.btnRed}`} disabled={busy} onClick={() => act(item.id, { kind: 'draft', action: 'approve' })}>
              {busy ? 'Sending…' : send}
            </button>
            <button className={styles.btn} disabled={busy} onClick={() => setText(item.message)}>Edit</button>
            <button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => act(item.id, { kind: 'draft', action: 'reject' })}>Not this one</button>
          </>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#5B6B7F' }}>
        {item.coachTouch ? 'Goes out as a message from you, through PAX, when you send it.' : 'Goes out from PAX when you send it; Done / Not today on their lock screen answers it.'}
      </p>
    </div>
  );
}
