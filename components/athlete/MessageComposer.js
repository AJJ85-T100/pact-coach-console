'use client';

/**
 * The one place a coach messages an athlete, at the top of the Messages tab.
 * Every "Reply" and "Message" button in the console lands here.
 *
 *   In your words  → /api/notes: saved as a coach note (the athlete's Today
 *                    screen shows it word for word) and passed on by PAX,
 *                    credited to the coach, by push or Telegram.
 *   PAX writes it  → /api/nudge: the coach gives the gist, PAX writes it in the
 *                    coach's voice and sends it now.
 *
 * Both go through the engine as the signed-in coach. The draft survives a
 * failed send.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './overview.module.css';

const MODES = [
  { id: 'own', label: 'In your words', hint: 'PAX passes it on from you, keeping what you said, and the note shows word for word on their Today screen.' },
  { id: 'pax', label: 'PAX writes it', hint: 'Give PAX the gist. It writes the message in your voice and sends it now, without quoting you.' },
];

export default function MessageComposer({ clientId, firstName, autoFocus = false }) {
  const router = useRouter();
  const [mode, setMode] = useState('own');
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }
  const box = useRef(null);

  useEffect(() => { if (autoFocus) box.current?.focus(); }, [autoFocus]);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = mode === 'own'
        ? await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, body, urgent }) })
        : await fetch(`/api/nudge/${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: body }) });
      const j = await res.json().catch(() => ({}));
      if (mode === 'own') {
        if (!res.ok) throw new Error(j.error || 'Couldn’t send that. Try again.');
        setResult(j.relayed
          ? { ok: true, text: `Sent to ${firstName}.` }
          : { ok: true, text: `Saved on ${firstName}’s Today screen. They have no notifications or Telegram, so it wasn’t pushed.` });
      } else {
        if (!res.ok && !j.sent) throw new Error(j.error || 'PAX couldn’t send that. Try again.');
        setResult(res.ok
          ? { ok: true, text: `PAX sent: “${j.sent}”` }
          : { ok: false, text: `PAX wrote “${j.sent}” but couldn’t deliver it: ${firstName} has no notifications or Telegram connected.` });
      }
      setText('');
      setUrgent(false);
      router.refresh();
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const current = MODES.find((m) => m.id === mode);
  return (
    <form onSubmit={send} className={s.card} aria-labelledby="compose-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="compose-h" className={s.h} style={{ fontSize: 15 }}>Message {firstName}</h2>
        <div role="radiogroup" aria-label="Who writes it" className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => { setMode(m.id); setResult(null); }}
              className={`min-h-[40px] px-3 text-[13px] font-semibold border ${mode === m.id ? 'bg-blue text-white border-blue' : 'bg-white text-blue border-border hover:border-blue'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="compose-text" className="sr-only">{mode === 'own' ? `Your message to ${firstName}` : `What PAX should say to ${firstName}`}</label>
      <textarea
        id="compose-text"
        ref={box}
        value={text}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
        rows={3}
        maxLength={mode === 'own' ? 1000 : 500}
        placeholder={mode === 'own' ? `Hi ${firstName}, saw the knee flagged. Swap tomorrow’s squats for the bike and we’ll look at it Thursday.` : 'e.g. check in on the knee before tomorrow’s session'}
        className="w-full bg-bg border border-border px-3.5 py-3 text-[15px] text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-y"
      />
      <p className="m-0 text-[13px] text-[#5B6B7F]">{current.hint}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === 'own' ? (
          <label className="flex items-center gap-2 text-[14px] text-blue min-h-[44px]">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="w-5 h-5" />
            Mark as urgent
          </label>
        ) : <span />}
        <button type="submit" disabled={busy || !text.trim()} className="min-h-[44px] px-5 bg-red text-white text-[14px] font-semibold hover:bg-red-deep disabled:opacity-40">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {result && (
        <p role="status" className="m-0 text-[14px]" style={{ color: result.ok ? '#1B6E3A' : '#B42318', overflowWrap: 'anywhere' }}>{result.text}</p>
      )}
    </form>
  );
}
