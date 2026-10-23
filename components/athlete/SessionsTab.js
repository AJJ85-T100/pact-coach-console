'use client';

/**
 * Sessions tab on the athlete page: the next appointment, and a note after
 * each session (typed, or held-to-dictate in Chrome/Edge). Moved here from
 * the old Pre-session briefs page, minus its AI-written brief: that brief
 * sent athlete data to a model from the console with no consent check, and
 * the Overview now carries the same facts (injuries, the why, this week).
 *
 * Data: /api/appointments (adds to the coach's Google Calendar or emails an
 * invite) and /api/coach-meetings (one row per session, with the note).
 */
import { useEffect, useRef, useState } from 'react';
import s from './overview.module.css';
import PaxKnows from './PaxKnows';

const WD_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SessionsTab({ clientId, firstName, trainingDays }) {
  // Facts PAX picked out of the note just saved, waiting for keep / bin.
  const [proposals, setProposals] = useState([]);
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <Appointments clientId={clientId} firstName={firstName} trainingDays={trainingDays} />
      <SessionNotes clientId={clientId} firstName={firstName} onProposals={setProposals} />
      <PaxKnows clientId={clientId} firstName={firstName} proposals={proposals} onProposalsDone={() => setProposals([])} />
    </div>
  );
}

function Appointments({ clientId, firstName, trainingDays }) {
  const [list, setList] = useState(null);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const r = await fetch(`/api/appointments?clientId=${clientId}`, { cache: 'no-store' });
      const j = await r.json();
      setList(j.appointments || []);
    } catch {
      setList([]);
    }
  }

  useEffect(() => {
    load();
    setWhen(defaultWhen(trainingDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function schedule() {
    if (!when) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, scheduledAt: new Date(when).toISOString() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: j.error || 'Couldn’t save that session. Try again.' });
      else setMsg({ ok: true, text: j.calendar === 'google' ? 'Booked and added to your Google Calendar.' : j.calendar === 'ics' ? 'Booked. A calendar invite is in your inbox.' : 'Booked.' });
      await load();
    } catch {
      setMsg({ ok: false, text: 'Couldn’t reach the server. Try again.' });
    }
    setBusy(false);
  }

  async function cancel(id) {
    try {
      await fetch(`/api/appointments?id=${id}`, { method: 'DELETE' });
      await load();
    } catch { /* the list reloads next time */ }
  }

  const next = list?.[0];
  return (
    <section className={s.card} aria-labelledby="sess-next" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id="sess-next" className={s.h} style={{ fontSize: 15 }}>Next session</h2>
      {list === null ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Loading…</p>
      ) : next ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[16px] font-bold text-blue">{fmtAppt(next.scheduled_at)}</p>
            <p className="m-0 text-[13px] text-[#5B6B7F]">{relDays(next.scheduled_at)}</p>
          </div>
          <button type="button" onClick={() => cancel(next.id)} className="min-h-[44px] px-3 text-[13px] font-semibold text-[#5B6B7F] hover:text-red">Cancel</button>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Nothing booked with {firstName}.</p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label htmlFor="sess-when" className="sr-only">Session date and time</label>
        <input
          id="sess-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="flex-1 min-w-[200px] min-h-[44px] text-[14px] text-blue bg-bg border border-border px-3 focus:outline-none focus:border-blue"
        />
        <button type="button" onClick={schedule} disabled={busy || !when} className="min-h-[44px] px-4 bg-blue text-white text-[14px] font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : 'Book session'}
        </button>
      </div>
      {msg && <p role="status" className="m-0 text-[13px]" style={{ color: msg.ok ? '#1B6E3A' : '#B42318' }}>{msg.text}</p>}
      {list && list.length > 1 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1">
          {list.slice(1).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-[14px] text-blue">
              <span>{fmtAppt(a.scheduled_at)}</span>
              <button type="button" onClick={() => cancel(a.id)} className="min-h-[40px] px-2 text-[13px] text-[#5B6B7F] hover:text-red">Cancel</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionNotes({ clientId, firstName, onProposals }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [recording, setRecording] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const rec = useRef(null);
  const base = useRef('');

  async function load() {
    try {
      const r = await fetch(`/api/coach-meetings?clientId=${clientId}`, { cache: 'no-store' });
      const j = await r.json();
      setList(j.meetings || []);
    } catch {
      setList([]);
    }
  }

  useEffect(() => {
    load();
    setCanDictate(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function startRec(e) {
    e.preventDefault();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    base.current = text ? `${text.trim()} ` : '';
    r.onresult = (ev) => {
      let said = '';
      for (let i = 0; i < ev.results.length; i++) said += ev.results[i][0].transcript;
      setText(base.current + said);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);
    rec.current = r;
    try { r.start(); setRecording(true); } catch { /* already running */ }
  }

  function stopRec() {
    try { rec.current?.stop(); } catch { /* not running */ }
    setRecording(false);
  }

  async function save() {
    if (recording) stopRec();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch('/api/coach-meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, note: text.trim() || null }),
      });
      if (!r.ok) throw new Error();
      const saved = text.trim();
      setText('');
      await load();
      // Ask PAX for the lasting facts in it. Nothing is kept until the coach says so.
      if (saved.length >= 15) {
        fetch(`/api/athletes/${clientId}/note-facts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: saved }) })
          .then((x) => x.json())
          .then((j) => { if (Array.isArray(j?.facts) && j.facts.length) onProposals?.(j.facts); })
          .catch(() => {});
      }
    } catch {
      setErr('Couldn’t save that. Your note is still here; try again.');
    }
    setSaving(false);
  }

  const notes = (list || []).filter((m) => m.note && m.note.trim());
  return (
    <section className={s.card} aria-labelledby="sess-notes" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 id="sess-notes" className={s.h} style={{ fontSize: 15 }}>Session notes</h2>
        <p className="mt-1 mb-0 text-[13px] text-[#5B6B7F]">{firstName} never sees these. PAX reads them so its messages fit what you saw, and offers to remember anything lasting.</p>
      </div>
      <label htmlFor="sess-note" className="sr-only">What happened in the session</label>
      <textarea
        id="sess-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={canDictate ? 'What happened in today’s session? Type, or hold the mic to dictate.' : 'What happened in today’s session?'}
        className="w-full bg-bg border border-border px-3.5 py-3 text-[15px] text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canDictate ? (
          <button
            type="button"
            onPointerDown={startRec}
            onPointerUp={stopRec}
            onPointerLeave={stopRec}
            className={`min-h-[44px] px-3 inline-flex items-center gap-2 text-[13px] font-semibold border select-none ${recording ? 'bg-red text-white border-red' : 'bg-white text-blue border-border hover:border-blue'}`}
          >
            <span className={`w-2 h-2 rounded-full ${recording ? 'bg-white animate-pulse' : 'bg-red'}`} aria-hidden="true" />
            {recording ? 'Listening… let go to stop' : 'Hold to dictate'}
          </button>
        ) : <span />}
        <button type="button" onClick={save} disabled={saving} className="min-h-[44px] px-4 bg-red text-white text-[14px] font-semibold hover:bg-red-deep disabled:opacity-50">
          {saving ? 'Saving…' : 'Log session'}
        </button>
      </div>
      {err && <p role="alert" className="m-0 text-[13px] text-[#B42318]">{err}</p>}
      {list === null ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">No session notes yet. Each session you log shows here.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-3 border-t border-border pt-3">
          {notes.slice(0, 10).map((m) => (
            <li key={m.id} className="flex gap-3">
              <span className="text-[12px] font-semibold text-[#5B6B7F] uppercase whitespace-nowrap pt-0.5 w-[64px] flex-shrink-0">{fmtDate(m.met_at)}</span>
              <span className="text-[14px] text-blue leading-normal">{m.note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function defaultWhen(days) {
  const now = new Date();
  let target = null;
  if (Array.isArray(days) && days.length) {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      d.setHours(9, 0, 0, 0);
      if (days.includes(WD_JS[d.getDay()])) { target = d; break; }
    }
  }
  if (!target) {
    target = new Date(now);
    target.setDate(now.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}T${p(target.getHours())}:${p(target.getMinutes())}`;
}

function fmtAppt(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return ''; }
}

function relDays(iso) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
