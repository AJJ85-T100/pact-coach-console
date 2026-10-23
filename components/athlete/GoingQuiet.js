'use client';

/**
 * Going quiet — the Cortex's flag for this athlete, inside "Do this next" on
 * the Overview. One item from the coach's needs-you `quiet` list (engine
 * GET /v1/coach/needs-you), filtered to this athlete by DoThisNext: the
 * headline as the engine wrote it, the evidence (each signal judged against
 * the athlete's own history) and the signals that moved. "I've got this"
 * clears the flag through the same engine route as an escalation, which
 * writes the coach_labels row. Colour is neutral: going quiet is a signal to
 * act on, not a fault.
 */
import Link from 'next/link';
import { quietSignalLabel } from '@/components/needs-you/useNeedsYou';
import s from './overview.module.css';

export default function GoingQuiet({ item, busy, onHandled, conversationHref }) {
  if (!item) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #EEF1F5', paddingTop: 14 }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0A2540' }}>{item.headline}</p>
      {item.evidence && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#5B6B7F' }}>{item.evidence}</p>}
      {item.signals?.length > 0 && (
        <ul aria-label="What moved" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {item.signals.map((k) => (
            <li key={k} className={s.tag} style={{ color: '#5B6B7F' }}>{quietSignalLabel(k)}</li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className={`${s.btn} ${s.btnBlue}`} disabled={busy} onClick={onHandled}>
          {busy ? 'Saving…' : 'I’ve got this'}
        </button>
        {conversationHref && <Link href={conversationHref} className={`${s.btn} ${s.btnGhost}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Message</Link>}
      </div>
    </div>
  );
}
