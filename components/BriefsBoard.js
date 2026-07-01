'use client';

import { useEffect, useRef, useState } from 'react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TODAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

export default function BriefsBoard({ clients, ptName }) {
  const [roster, setRoster] = useState(clients || []);
  const [selectedId, setSelectedId] = useState(clients?.[0]?.id || null);
  const [briefs, setBriefs] = useState({}); // id -> { loading, error, data }
  const [notes, setNotes] = useState({});   // id -> { loading, list }
  const [appts, setAppts] = useState({});   // id -> { loading, next, list }
  const [rosterWidth, setRosterWidth] = useState(330);
  const rosterWidthRef = useRef(330);
  const rosterElRef = useRef(null);
  const draggingRef = useRef(false);
  const leftRef = useRef(0);

  function startDrag(e) {
    e.preventDefault();
    draggingRef.current = true;
    leftRef.current = rosterElRef.current ? rosterElRef.current.getBoundingClientRect().left : 0;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  async function loadBrief(id) {
    setBriefs((b) => ({ ...b, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/briefs/${id}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not generate brief.');
      setBriefs((b) => ({ ...b, [id]: { data: j } }));
    } catch (e) {
      setBriefs((b) => ({ ...b, [id]: { error: e.message } }));
    }
  }

  async function loadNotes(id) {
    setNotes((n) => ({ ...n, [id]: { loading: true, list: n[id]?.list || [] } }));
    try {
      const res = await fetch(`/api/coach-meetings?clientId=${id}`, { cache: 'no-store' });
      const j = await res.json();
      setNotes((n) => ({ ...n, [id]: { list: j.meetings || [] } }));
    } catch {
      setNotes((n) => ({ ...n, [id]: { list: [] } }));
    }
  }

  async function loadAppts(id) {
    setAppts((a) => ({ ...a, [id]: { loading: true, next: a[id]?.next || null } }));
    try {
      const res = await fetch(`/api/appointments?clientId=${id}`, { cache: 'no-store' });
      const j = await res.json();
      setAppts((a) => ({ ...a, [id]: { next: j.next || null, list: j.appointments || [] } }));
    } catch {
      setAppts((a) => ({ ...a, [id]: { next: null, list: [] } }));
    }
  }

  async function scheduleAppt(id, whenLocal) {
    try {
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id, scheduledAt: whenLocal }),
      });
    } catch {
      /* non-fatal */
    }
    loadAppts(id);
  }

  function selectClient(id) {
    setSelectedId(id);
    if (!briefs[id] || briefs[id].error) loadBrief(id);
    if (!notes[id]) loadNotes(id);
    if (!appts[id]) loadAppts(id);
  }

  async function saveNote(id, text) {
    try {
      await fetch('/api/coach-meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: id, note: text || null }),
      });
    } catch {
      /* non-fatal */
    }
    await loadNotes(id);
    loadBrief(id); // logging resets the "since" window to now
  }

  useEffect(() => {
    if (selectedId) {
      if (!briefs[selectedId]) loadBrief(selectedId);
      if (!notes[selectedId]) loadNotes(selectedId);
    }
    try {
      const saved = parseInt(localStorage.getItem('pact_briefs_roster_w') || '', 10);
      if (saved >= 260 && saved <= 560) {
        setRosterWidth(saved);
        rosterWidthRef.current = saved;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return;
      const w = Math.min(560, Math.max(260, e.clientX - leftRef.current));
      rosterWidthRef.current = w;
      setRosterWidth(w);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        localStorage.setItem('pact_briefs_roster_w', String(rosterWidthRef.current));
      } catch {}
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const selected = roster.find((c) => c.id === selectedId) || null;
  const state = selectedId ? briefs[selectedId] : null;
  const noteState = selectedId ? notes[selectedId] : null;

  // Group roster by workout weekday (from the active programme; a client can train more than one day).
  const scheduled = WEEKDAYS.map((day) => ({
    day,
    clients: roster.filter((c) => Array.isArray(c.workout_days) && c.workout_days.includes(day)),
  })).filter((g) => g.clients.length > 0);
  const unscheduled = roster.filter((c) => !Array.isArray(c.workout_days) || c.workout_days.length === 0);

  return (
    <div className="flex h-screen">
      {/* Roster column */}
      <div ref={rosterElRef} className="flex-shrink-0 overflow-y-auto p-6 bg-white" style={{ width: rosterWidth }}>
        <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
          <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">This week</span>
        </div>
        <h1 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none mb-1">
          Pre-session briefs
        </h1>
        <p className="font-['Inter'] text-[13px] text-[#4A4A4A] mb-6">
          {roster.length} {roster.length === 1 ? 'athlete' : 'athletes'} · grouped by their workout days.
        </p>

        {roster.length === 0 && (
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">No athletes yet.</p>
        )}

        {scheduled.map((g) => (
          <DayGroup key={g.day} day={g.day} clients={g.clients} selectedId={selectedId} onSelect={selectClient} />
        ))}

        {unscheduled.length > 0 && (
          <DayGroup day="Unscheduled" clients={unscheduled} selectedId={selectedId} onSelect={selectClient} muted />
        )}
      </div>

      {/* Resizer */}
      <div
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="w-1.5 flex-shrink-0 cursor-col-resize bg-[#E2E6EB] hover:bg-[#D92D20] active:bg-[#D92D20] transition-colors"
      />

      {/* Brief panel */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-w-0 bg-[#F4F6F8]">
        {!selected ? (
          <p className="font-['Inter'] text-[#8A95A3]">Select an athlete to see their brief.</p>
        ) : (
          <BriefPanel
            client={selected}
            state={state}
            noteState={noteState}
            onSaveNote={(text) => saveNote(selected.id, text)}
            onRetry={() => loadBrief(selected.id)}
          />
        )}
      </div>
    </div>
  );
}

function DayGroup({ day, clients, selectedId, onSelect, muted }) {
  const isToday = day === TODAY;
  return (
    <div className="mb-5">
      <div className={`flex items-center gap-2 mb-2 px-1 ${isToday ? '' : ''}`}>
        <span className={`font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase ${muted ? 'text-[#8A95A3]' : 'text-[#0A2540]'}`}>
          {day}
        </span>
        {isToday && (
          <span className="font-['Inter'] text-[9px] font-bold tracking-[0.1em] bg-[#D92D20] text-white px-1.5 py-0.5 rounded-[3px]">TODAY</span>
        )}
        <span className="flex-1 h-px bg-[#E2E6EB]" />
      </div>
      <div className="space-y-2">
        {clients.map((c) => (
          <RosterCard key={`${day}-${c.id}`} client={c} selected={c.id === selectedId} onSelect={onSelect} highlight={isToday} />
        ))}
      </div>
    </div>
  );
}

function RosterCard({ client, selected, onSelect, highlight }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <button
      onClick={() => onSelect(client.id)}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-[8px] border transition-colors ${
        selected ? 'border-[#D92D20] border-2 bg-white' : 'border-[#E2E6EB] bg-white hover:bg-[#F4F6F8]'
      }`}
    >
      <div className={`w-10 h-10 rounded-[6px] grid place-items-center font-['Montserrat'] font-bold text-[13px] flex-shrink-0 text-white ${highlight ? 'bg-[#D92D20]' : 'bg-[#0A2540]'}`}>
        {initials}
      </div>
      <div className="min-w-0">
        <div className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] truncate">{client.name || 'Unnamed'}</div>
        <div className="font-['Inter'] text-[11px] text-[#8A95A3]">
          {client.goal ? String(client.goal).slice(0, 28) : (client.status || 'active')}
        </div>
      </div>
    </button>
  );
}

function BriefPanel({ client, state, noteState, onSaveNote, onRetry }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const data = state?.data;
  const brief = data?.brief;
  const since = data?.since;
  const stats = data?.stats;
  const days = Array.isArray(client.workout_days) ? client.workout_days : [];

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[18px] flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[13px] text-[#8A95A3] mt-1">
            {client.current_weight ? `${client.current_weight}kg` : ''}
            {client.target_weight ? ` \u2192 ${client.target_weight}kg target` : ''}
            {client.status ? ` \u00b7 ${client.status}` : ''}
          </div>
        </div>
      </div>

      <AppointmentBlock clientId={client.id} workoutDays={days} />

      {/* Workout days (from active programme) */}
      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3]">Workout days</span>
          <span className="font-['Inter'] text-[10px] text-[#8A95A3]">from active programme</span>
        </div>
        {days.length === 0 ? (
          <p className="font-['Inter'] text-[12px] text-[#8A95A3] italic">
            No scheduled sessions — add days in the programme builder and they’ll show here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d);
              const isToday = d === TODAY;
              return (
                <span
                  key={d}
                  className={`font-['Inter'] text-[12px] font-semibold px-3 py-1.5 rounded-[6px] border ${
                    on
                      ? `bg-[#0A2540] text-white border-[#0A2540] ${isToday ? 'ring-2 ring-[#D92D20] ring-offset-1' : ''}`
                      : 'bg-white text-[#C2C9D2] border-[#E2E6EB]'
                  }`}
                >
                  {d}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Stat tiles */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          <StatTile label="Adherence" value={stats.adherence_pct == null ? '\u2014' : `${stats.adherence_pct}%`} tone={adherenceTone(stats.adherence_pct)} />
          <StatTile label="Pacts kept" value={`${stats.wins}/${stats.win_total}`} />
          <StatTile label="Days tracked" value={String(stats.days_logged)} />
          <StatTile label="Best streak" value={stats.top_streak > 0 ? String(stats.top_streak) : '\u2014'} />
        </div>
      )}

      {/* Your notes — the PT's own recap, above the data */}
      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540]">Your session notes</span>
          <span className="font-['Inter'] text-[11px] text-[#8A95A3]">
            {since ? (since.logged ? `last logged ${since.days_ago}d ago` : 'none logged yet') : ''}
          </span>
        </div>
        <NoteComposer onSave={onSaveNote} />
        <NoteHistory noteState={noteState} />
      </div>

      {state?.loading && (
        <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-6 text-center">
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is reading the last few weeks…</p>
        </div>
      )}

      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn’t generate:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {brief && (
        <>
          <Section title="Since you last met" tag="PAX">
            {Array.isArray(brief.since_summary) && brief.since_summary.length > 0 ? (
              <ul className="bg-white border border-[#E2E6EB] rounded-[8px] px-4">
                {brief.since_summary.map((s, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-2.5 border-b border-[#E2E6EB] last:border-b-0 font-['Inter'] text-[13.5px] text-[#0A2540] leading-[1.5]">
                    <span className="w-[6px] h-[6px] rounded-full bg-[#8A95A3] mt-2 flex-shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Section>

          {brief.why && (
            <Section title="The why" tag="PAX">
              <div className="bg-[#EBF1F5] border-l-[3px] border-[#0A2540] rounded-[0_6px_6px_0] p-4 font-['Inter'] text-[13.5px] leading-[1.6] text-[#0A2540]">
                {brief.why}
              </div>
            </Section>
          )}

          {Array.isArray(brief.red_flags) && brief.red_flags.length > 0 && (
            <Section title="Focus today">
              <div className="space-y-2">
                {brief.red_flags.map((f, i) => (
                  <div key={i} className="flex gap-2.5 items-start bg-white border border-[#E2E6EB] border-l-[3px] border-l-[#D92D20] rounded-[0_6px_6px_0] p-3 font-['Inter'] text-[13px] text-[#0A2540] leading-[1.45]">
                    <span className="text-[#D92D20] font-extrabold flex-shrink-0">!</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {Array.isArray(brief.suggested_actions) && brief.suggested_actions.length > 0 && (
            <Section title="Suggested moves">
              <ul className="bg-white border border-[#E2E6EB] rounded-[8px] px-4">
                {brief.suggested_actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-2.5 border-b border-[#E2E6EB] last:border-b-0 font-['Inter'] text-[13.5px] text-[#0A2540] leading-[1.5]">
                    <span className="w-[18px] h-[18px] rounded-[4px] bg-[#0A2540] text-white grid place-items-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief.safety_check && (
            <Section title="Safety check">
              <div className={`bg-white border rounded-[8px] p-3 font-['Inter'] text-[13px] leading-[1.5] ${/no conflict/i.test(brief.safety_check) ? 'border-[#E2E6EB] text-[#0F8A5F]' : 'border-l-[3px] border-l-[#D92D20] border-[#E2E6EB] text-[#D92D20] font-medium'}`}>
                {brief.safety_check}
              </div>
            </Section>
          )}

          <ConversationThread clientId={client.id} since={since?.at} />

          <div className="flex gap-2 mt-6">
            <a href={`/dashboard/clients/${client.id}/programs`} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors">Open programmes</a>
            <button onClick={onRetry} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors">Regenerate</button>
          </div>
        </>
      )}
    </div>
  );
}

function NoteComposer({ onSave }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);
  const baseRef = useRef('');

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  function startRec(e) {
    e.preventDefault();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = text ? `${text.trim()} ` : '';
    rec.onresult = (ev) => {
      let s = '';
      for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript;
      setText(baseRef.current + s);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {}
  }

  function stopRec() {
    try {
      recRef.current && recRef.current.stop();
    } catch {}
    setRecording(false);
  }

  async function save() {
    if (recording) stopRec();
    setSaving(true);
    await onSave(text.trim());
    setText('');
    setSaving(false);
  }

  return (
    <div className="mb-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="What happened in today’s session? Type, or hold the mic to dictate."
        className="w-full font-['Inter'] text-[13px] text-[#0A2540] bg-[#F4F6F8] border border-[#E2E6EB] rounded-[6px] p-3 resize-y focus:outline-none focus:border-[#D92D20]"
      />
      <div className="flex items-center justify-between mt-2 gap-2">
        {supported ? (
          <button
            onPointerDown={startRec}
            onPointerUp={stopRec}
            onPointerLeave={stopRec}
            className={`flex items-center gap-2 font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.06em] px-3 py-2 rounded-[6px] border transition-colors select-none ${
              recording ? 'bg-[#D92D20] text-white border-[#D92D20]' : 'bg-white text-[#0A2540] border-[#E2E6EB] hover:border-[#0A2540]'
            }`}
            title="Press and hold to dictate"
          >
            <span className={`w-2 h-2 rounded-full ${recording ? 'bg-white animate-pulse' : 'bg-[#D92D20]'}`} />
            {recording ? 'Listening… release to stop' : 'Hold to record'}
          </button>
        ) : (
          <span className="font-['Inter'] text-[10px] text-[#8A95A3]">Voice dictation needs Chrome or Edge.</span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-60 text-white font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.06em] px-4 py-2 rounded-[6px] transition-colors"
        >
          {saving ? 'Saving…' : '✓ Log session + note'}
        </button>
      </div>
    </div>
  );
}

function NoteHistory({ noteState }) {
  const list = noteState?.list || [];
  const withNotes = list.filter((m) => m.note && m.note.trim());
  if (noteState?.loading && list.length === 0) {
    return <p className="font-['Inter'] text-[12px] text-[#8A95A3]">Loading notes…</p>;
  }
  if (withNotes.length === 0) {
    return <p className="font-['Inter'] text-[12px] text-[#8A95A3] italic">No notes logged yet — your recap from each session shows here.</p>;
  }
  return (
    <div className="border-t border-[#E2E6EB] pt-3 space-y-2.5">
      {withNotes.slice(0, 5).map((m) => (
        <div key={m.id} className="flex gap-3">
          <span className="font-['Inter'] text-[11px] font-semibold text-[#8A95A3] uppercase tracking-[0.05em] whitespace-nowrap pt-0.5 w-[64px] flex-shrink-0">{fmtDate(m.met_at)}</span>
          <span className="font-['Inter'] text-[13px] text-[#0A2540] leading-[1.5]">{m.note}</span>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, tone }) {
  const color = tone === 'good' ? 'text-[#0F8A5F]' : tone === 'warn' ? 'text-[#D97706]' : tone === 'bad' ? 'text-[#D92D20]' : 'text-[#0A2540]';
  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-3 text-center">
      <div className={`font-['Montserrat'] font-extrabold text-2xl leading-none ${color}`}>{value}</div>
      <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A95A3] mt-1.5">{label}</div>
    </div>
  );
}

function adherenceTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'warn';
  return 'bad';
}

function Section({ title, tag, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540]">{title}</span>
        {tag && <span className="font-['Inter'] text-[9px] font-bold tracking-[0.1em] bg-[#0A2540] text-white px-1.5 py-0.5 rounded-[3px]">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="font-['Inter'] text-[13px] text-[#8A95A3] italic">Not enough data in this window yet.</p>;
}

// The raw PAX <-> client thread — the evidence beneath the brief. Collapsed by
// default (the brief is the headline); lazy-loads on open and aligns to the
// same "since last met" window so it reads as what the brief was built from.
function ConversationThread({ clientId, since }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null); // { loading } | { error } | { messages }

  async function load() {
    setState({ loading: true });
    try {
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      const res = await fetch(`/api/conversation/${clientId}${qs}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load the conversation.');
      setState({ messages: j.messages || [] });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !state) load();
  }

  const messages = state?.messages || [];

  return (
    <div className="mb-5">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between bg-white border border-[#E2E6EB] rounded-[8px] px-4 py-3 hover:border-[#0A2540] transition-colors"
      >
        <span className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540]">
          The conversation
        </span>
        <span className="font-['Inter'] text-[11px] font-semibold text-[#8A95A3] uppercase tracking-[0.05em]">
          {open ? 'Hide \u2013' : 'Read the actual thread \u2192'}
        </span>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-[#E2E6EB] rounded-[8px] p-4 max-h-[440px] overflow-y-auto">
          {state?.loading && (
            <p className="font-['Inter'] text-[12px] text-[#8A95A3]">Loading the thread{'\u2026'}</p>
          )}
          {state?.error && (
            <p className="font-['Inter'] text-[12px] text-[#D92D20]">{state.error}</p>
          )}
          {state && !state.loading && !state.error && (
            messages.length === 0 ? (
              <p className="font-['Inter'] text-[13px] text-[#8A95A3] italic">
                No messages{since ? ' since you last met' : ' yet'}.
              </p>
            ) : (
              <>
                <p className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[0.1em] mb-3">
                  {messages.length} message{messages.length === 1 ? '' : 's'}{since ? ' since you last met' : ''}
                </p>
                <div className="space-y-2">
                  {messages.map((m, i) => {
                    const isPax = m.role === 'assistant';
                    return (
                      <div key={i} className={`flex ${isPax ? 'justify-start' : 'justify-end'}`}>
                        <div
                          className={`max-w-[78%] px-3 py-2 rounded-[8px] font-['Inter'] text-[13px] leading-[1.5] ${
                            isPax
                              ? 'bg-[#EBF1F5] text-[#0A2540] rounded-bl-[2px]'
                              : 'bg-[#D92D20] text-white rounded-br-[2px]'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          <div className={`text-[10px] mt-1 ${isPax ? 'text-[#8A95A3]' : 'text-white/70'}`}>
                            {isPax ? 'PAX' : 'Client'} {'\u00b7'} {fmtMsgTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

function fmtMsgTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function AppointmentBlock({ clientId, workoutDays }) {
  const [list, setList] = useState(null);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

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
    setWhen(defaultWhen(workoutDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function schedule() {
    if (!when) return;
    setBusy(true);
    try {
      await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, scheduledAt: new Date(when).toISOString() }),
      });
      await load();
    } catch {}
    setBusy(false);
  }

  async function cancel(id) {
    try {
      await fetch(`/api/appointments?id=${id}`, { method: 'DELETE' });
      await load();
    } catch {}
  }

  const next = list && list[0];

  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4 mb-4">
      <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-2">Next appointment</div>

      {list === null ? (
        <p className="font-['Inter'] text-[12px] text-[#8A95A3]">Loading…</p>
      ) : next ? (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="font-['Montserrat'] font-bold text-[15px] text-[#0A2540]">{fmtAppt(next.scheduled_at)}</div>
            <div className="font-['Inter'] text-[11px] text-[#8A95A3]">{relDays(next.scheduled_at)}</div>
          </div>
          <button onClick={() => cancel(next.id)} className="font-['Inter'] text-[11px] font-semibold text-[#8A95A3] hover:text-[#D92D20] uppercase tracking-[0.05em]">Cancel</button>
        </div>
      ) : (
        <p className="font-['Inter'] text-[12px] text-[#8A95A3] italic mb-3">No upcoming session scheduled.</p>
      )}

      <div className="flex items-center gap-2 border-t border-[#E2E6EB] pt-3">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="flex-1 font-['Inter'] text-[12px] text-[#0A2540] bg-[#F4F6F8] border border-[#E2E6EB] rounded-[6px] px-2.5 py-2 focus:outline-none focus:border-[#D92D20]"
        />
        <button
          onClick={schedule}
          disabled={busy || !when}
          className="bg-[#0A2540] hover:bg-[#0F3155] disabled:opacity-50 text-white font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.06em] px-3.5 py-2 rounded-[6px] transition-colors whitespace-nowrap"
        >
          {busy ? 'Saving…' : 'Schedule'}
        </button>
      </div>

      {list && list.length > 1 && (
        <div className="mt-3 space-y-1.5">
          {list.slice(1).map((a) => (
            <div key={a.id} className="flex items-center justify-between font-['Inter'] text-[12px] text-[#4A4A4A]">
              <span>{fmtAppt(a.scheduled_at)}</span>
              <button onClick={() => cancel(a.id)} className="text-[#8A95A3] hover:text-[#D92D20] text-[11px] uppercase tracking-[0.05em]">Cancel</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WD_JS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function defaultWhen(workoutDays) {
  const now = new Date();
  let target = null;
  if (Array.isArray(workoutDays) && workoutDays.length) {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      d.setHours(9, 0, 0, 0);
      if (workoutDays.includes(WD_JS[d.getDay()])) {
        target = d;
        break;
      }
    }
  }
  if (!target) {
    target = new Date(now);
    target.setDate(now.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }
  return toLocalInput(target);
}

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtAppt(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function relDays(iso) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
