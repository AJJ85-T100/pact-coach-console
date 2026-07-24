'use client';

/**
 * /dashboard/templates/[id] — view + edit one programme template.
 *
 * Edits write back to the template's sessions jsonb via PATCH
 * /api/templates/[id]. They affect FUTURE assignments only — programmes
 * already expanded from this template are independent copies and are
 * never touched (the banner says so).
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function newExercise(cardio = false) {
  return cardio
    ? { id: crypto.randomUUID(), name: '', mode: 'cardio', duration_minutes: 30, target_hr: '', notes: '' }
    : { id: crypto.randomUUID(), name: '', sets: 3, repsText: '8', load: '', tempo: '', rest_seconds: 90, rpe: '', notes: '' };
}

// jsonb reps → editable text ("6-8" / "8"), and back
function repsToText(e) {
  if (e.reps_min != null && e.reps_max != null) return `${e.reps_min}-${e.reps_max}`;
  if (e.reps != null) return String(e.reps);
  return '';
}
function textToReps(text) {
  const t = String(text || '').trim();
  const range = t.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return { reps_min: Number(range[1]), reps_max: Number(range[2]) };
  const single = t.match(/^(\d+)$/);
  if (single) return { reps: Number(single[1]) };
  return {};
}

function toEditable(sessions) {
  return (sessions || []).map((s) => ({
    key: crypto.randomUUID(),
    week: s.week,
    day_index: s.day_index ?? null,
    name: s.name || '',
    notes: s.notes || '',
    exercises: (s.exercises || []).map((e) => ({
      id: e.id || crypto.randomUUID(),
      name: e.name || '',
      mode: e.mode === 'cardio' ? 'cardio' : 'strength',
      // strength
      sets: e.sets ?? '',
      repsText: repsToText(e),
      load: e.load ?? '',
      tempo: e.tempo ?? '',
      rest_seconds: e.rest_seconds ?? '',
      rpe: e.rpe ?? '',
      // cardio
      duration_minutes: e.duration_minutes ?? '',
      target_hr: e.target_hr ?? '',
      notes: e.notes ?? '',
    })),
  }));
}

function toPayload(sessions) {
  return sessions.map((s) => ({
    week: Number(s.week),
    ...(s.day_index != null ? { day_index: Number(s.day_index) } : {}),
    name: s.name.trim(),
    ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
    exercises: s.exercises.map((e) => {
      if (e.mode === 'cardio') {
        return {
          id: e.id,
          name: e.name.trim(),
          mode: 'cardio',
          ...(e.duration_minutes !== '' ? { duration_minutes: Number(e.duration_minutes) } : {}),
          ...(e.target_hr ? { target_hr: e.target_hr } : {}),
          ...(e.notes.trim() ? { notes: e.notes.trim() } : {}),
        };
      }
      return {
        id: e.id,
        name: e.name.trim(),
        ...(e.sets !== '' ? { sets: Number(e.sets) } : {}),
        ...textToReps(e.repsText),
        ...(e.load !== '' ? { load: e.load } : {}),
        ...(e.tempo ? { tempo: e.tempo } : {}),
        ...(e.rest_seconds !== '' ? { rest_seconds: Number(e.rest_seconds) } : {}),
        ...(e.rpe !== '' ? { rpe: Number(e.rpe) } : {}),
        ...(e.notes.trim() ? { notes: e.notes.trim() } : {}),
      };
    }),
  }));
}

const inputCls =
  'border border-border rounded px-2 py-1.5 text-sm text-blue bg-white focus:outline-none focus:border-blue w-full';
const labelCls = 'text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1';

export default function TemplateEditorPage() {
  const { id } = useParams();
  const router = useRouter();

  const [meta, setMeta] = useState(null); // { name, weeks, notes }
  const [sessions, setSessions] = useState(null);
  const [openWeeks, setOpenWeeks] = useState(() => new Set([1]));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${id}`, { cache: 'no-store' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Could not load the template.');
        if (!alive) return;
        setMeta({ name: d.template.name || '', weeks: d.template.weeks || 1, notes: d.template.notes || '' });
        setSessions(toEditable(d.template.sessions));
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // Warn on leaving with unsaved edits
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const touch = useCallback((fn) => {
    setSessions((prev) => { const next = fn(structuredClone(prev)); return next; });
    setDirty(true);
  }, []);

  const weeks = useMemo(() => {
    if (!sessions) return [];
    const byWeek = new Map();
    sessions.forEach((s, idx) => {
      if (!byWeek.has(s.week)) byWeek.set(s.week, []);
      byWeek.get(s.week).push({ ...s, idx });
    });
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, list]) => [week, list.sort((a, b) => (a.day_index ?? 9) - (b.day_index ?? 9))]);
  }, [sessions]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: meta.name,
          weeks: Number(meta.weeks),
          notes: meta.notes,
          sessions: toPayload(sessions),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save.');
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ---- session ops -------------------------------------------------------
  const setSession = (idx, patch) => touch((s) => { Object.assign(s[idx], patch); return s; });
  const removeSession = (idx) => touch((s) => { s.splice(idx, 1); return s; });
  const addSession = (week) =>
    touch((s) => {
      s.push({ key: crypto.randomUUID(), week, day_index: null, name: 'New session', notes: '', exercises: [newExercise()] });
      return s;
    });
  const addWeek = () => {
    const next = (weeks.length ? Math.max(...weeks.map(([w]) => w)) : 0) + 1;
    addSession(next);
    setOpenWeeks((p) => new Set([...p, next]));
    setMeta((m) => ({ ...m, weeks: Math.max(Number(m.weeks) || 1, next) }));
  };

  // ---- exercise ops ------------------------------------------------------
  const setExercise = (sIdx, eIdx, patch) =>
    touch((s) => { Object.assign(s[sIdx].exercises[eIdx], patch); return s; });
  const removeExercise = (sIdx, eIdx) =>
    touch((s) => { s[sIdx].exercises.splice(eIdx, 1); return s; });
  const addExercise = (sIdx, cardio) =>
    touch((s) => { s[sIdx].exercises.push(newExercise(cardio)); return s; });
  const moveExercise = (sIdx, eIdx, dir) =>
    touch((s) => {
      const list = s[sIdx].exercises;
      const to = eIdx + dir;
      if (to < 0 || to >= list.length) return s;
      [list[eIdx], list[to]] = [list[to], list[eIdx]];
      return s;
    });
  const toggleMode = (sIdx, eIdx) =>
    touch((s) => {
      const e = s[sIdx].exercises[eIdx];
      e.mode = e.mode === 'cardio' ? 'strength' : 'cardio';
      if (e.mode === 'cardio' && e.duration_minutes === '') e.duration_minutes = 30;
      if (e.mode === 'strength' && e.sets === '') { e.sets = 3; e.repsText = e.repsText || '8'; }
      return s;
    });

  if (error && !sessions) {
    return (
      <div className="p-8 max-w-4xl">
        <div className="bg-white border-l-[3px] border-red rounded px-4 py-3 text-sm text-blue">
          <span className="font-bold">Something went wrong:</span> {error}
        </div>
      </div>
    );
  }
  if (!meta || !sessions) return <div className="p-8 text-body text-sm">Loading…</div>;

  const totalExercises = sessions.reduce((n, s) => n + s.exercises.length, 0);

  return (
    <div className="p-8 max-w-5xl pb-28">
      {/* Header */}
      <button
        onClick={() => {
          if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
          router.push('/dashboard/templates');
        }}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-blue transition-colors mb-3"
      >
        ← Templates
      </button>

      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Template editor</p>
      <input
        value={meta.name}
        onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }}
        className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-2 bg-transparent border-b-2 border-transparent hover:border-border focus:border-blue focus:outline-none w-full"
      />

      <div className="bg-white border-l-[3px] border-blue rounded px-4 py-3 text-[13px] text-body mb-6 max-w-2xl">
        Edits here change the <span className="font-semibold text-blue">master template only</span> — they apply to
        future assignments. Programmes already created from this template are independent copies and won't change.
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-end gap-4 mb-8">
        <div className="w-28">
          <label className={labelCls}>Planned weeks</label>
          <input
            type="number" min="1" max="52" value={meta.weeks}
            onChange={(e) => { setMeta({ ...meta, weeks: e.target.value }); setDirty(true); }}
            className={inputCls}
          />
        </div>
        <div className="flex-1 min-w-[260px]">
          <label className={labelCls}>Notes (visible in the library + New Programme form)</label>
          <textarea
            rows={2} value={meta.notes}
            onChange={(e) => { setMeta({ ...meta, notes: e.target.value }); setDirty(true); }}
            className={inputCls}
          />
        </div>
        <div className="text-[11px] text-muted pb-2 whitespace-nowrap">
          {sessions.length} sessions · {totalExercises} exercises
        </div>
      </div>

      {/* Weeks */}
      <div className="space-y-4">
        {weeks.map(([week, list]) => {
          const open = openWeeks.has(week);
          return (
            <div key={week} className="bg-white rounded-lg shadow-card border border-border">
              <button
                onClick={() =>
                  setOpenWeeks((p) => {
                    const n = new Set(p);
                    n.has(week) ? n.delete(week) : n.add(week);
                    return n;
                  })
                }
                className="w-full flex items-center justify-between px-5 py-3.5"
              >
                <span className="font-display font-bold text-blue text-sm uppercase tracking-tight">
                  Week {week}
                </span>
                <span className="text-[11px] text-muted">
                  {list.length} session{list.length === 1 ? '' : 's'} {open ? '▾' : '▸'}
                </span>
              </button>

              {open && (
                <div className="px-5 pb-5 space-y-4">
                  {list.map((s) => (
                    <div key={s.key} className="border border-border rounded-lg p-4">
                      {/* Session header row */}
                      <div className="flex flex-wrap items-end gap-3 mb-3">
                        <div className="flex-1 min-w-[180px]">
                          <label className={labelCls}>Session name</label>
                          <input
                            value={s.name}
                            onChange={(e) => setSession(s.idx, { name: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                        <div className="w-24">
                          <label className={labelCls}>Day</label>
                          <select
                            value={s.day_index ?? ''}
                            onChange={(e) =>
                              setSession(s.idx, { day_index: e.target.value === '' ? null : Number(e.target.value) })
                            }
                            className={inputCls}
                          >
                            <option value="">—</option>
                            {DAYS.map((d, i) => (
                              <option key={d} value={i + 1}>{d}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <label className={labelCls}>Week</label>
                          <input
                            type="number" min="1" max="52" value={s.week}
                            onChange={(e) => setSession(s.idx, { week: Number(e.target.value) || 1 })}
                            className={inputCls}
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Delete session "${s.name}"?`)) removeSession(s.idx);
                          }}
                          className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-red transition-colors pb-2"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mb-3">
                        <label className={labelCls}>Session notes (phase context — PAX sees this)</label>
                        <input
                          value={s.notes}
                          onChange={(e) => setSession(s.idx, { notes: e.target.value })}
                          className={inputCls}
                        />
                      </div>

                      {/* Exercises */}
                      <div className="space-y-2">
                        {s.exercises.map((e, eIdx) => (
                          <div key={e.id} className="bg-bg rounded p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col gap-0.5 pt-1">
                                <button onClick={() => moveExercise(s.idx, eIdx, -1)} className="text-muted hover:text-blue text-xs leading-none" title="Move up">▲</button>
                                <button onClick={() => moveExercise(s.idx, eIdx, 1)} className="text-muted hover:text-blue text-xs leading-none" title="Move down">▼</button>
                              </div>
                              <div className="flex-1">
                                <div className="flex flex-wrap gap-2 items-end">
                                  <div className="flex-1 min-w-[160px]">
                                    <label className={labelCls}>Exercise</label>
                                    <input
                                      value={e.name}
                                      onChange={(ev) => setExercise(s.idx, eIdx, { name: ev.target.value })}
                                      className={inputCls}
                                      placeholder="e.g. Back Squat"
                                    />
                                  </div>
                                  <button
                                    onClick={() => toggleMode(s.idx, eIdx)}
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-2 rounded transition-colors ${
                                      e.mode === 'cardio' ? 'bg-blue text-white' : 'bg-white border border-border text-blue'
                                    }`}
                                    title="Toggle sets×reps / cardio"
                                  >
                                    {e.mode === 'cardio' ? 'Cardio' : 'Sets × reps'}
                                  </button>
                                  <button
                                    onClick={() => removeExercise(s.idx, eIdx)}
                                    className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-red transition-colors pb-2"
                                  >
                                    ✕
                                  </button>
                                </div>

                                {e.mode === 'cardio' ? (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    <div className="w-24">
                                      <label className={labelCls}>Minutes</label>
                                      <input type="number" min="1" value={e.duration_minutes}
                                        onChange={(ev) => setExercise(s.idx, eIdx, { duration_minutes: ev.target.value })}
                                        className={inputCls} />
                                    </div>
                                    <div className="w-32">
                                      <label className={labelCls}>Target HR</label>
                                      <input value={e.target_hr}
                                        onChange={(ev) => setExercise(s.idx, eIdx, { target_hr: ev.target.value })}
                                        className={inputCls} placeholder="Zone 2" />
                                    </div>
                                    <div className="flex-1 min-w-[200px]">
                                      <label className={labelCls}>Notes</label>
                                      <input value={e.notes}
                                        onChange={(ev) => setExercise(s.idx, eIdx, { notes: ev.target.value })}
                                        className={inputCls} placeholder="Rounds, scheme, cues…" />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <div className="w-16">
                                        <label className={labelCls}>Sets</label>
                                        <input type="number" min="1" max="20" value={e.sets}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { sets: ev.target.value })}
                                          className={inputCls} />
                                      </div>
                                      <div className="w-20">
                                        <label className={labelCls}>Reps</label>
                                        <input value={e.repsText}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { repsText: ev.target.value })}
                                          className={inputCls} placeholder="8 or 6-8" />
                                      </div>
                                      <div className="w-24">
                                        <label className={labelCls}>Load</label>
                                        <input value={e.load}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { load: ev.target.value })}
                                          className={inputCls} placeholder="blank = per athlete" />
                                      </div>
                                      <div className="w-20">
                                        <label className={labelCls}>Tempo</label>
                                        <input value={e.tempo}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { tempo: ev.target.value })}
                                          className={inputCls} placeholder="3-1-1" />
                                      </div>
                                      <div className="w-20">
                                        <label className={labelCls}>Rest (s)</label>
                                        <input type="number" min="0" max="900" value={e.rest_seconds}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { rest_seconds: ev.target.value })}
                                          className={inputCls} />
                                      </div>
                                      <div className="w-16">
                                        <label className={labelCls}>RPE</label>
                                        <input type="number" min="1" max="10" step="0.5" value={e.rpe}
                                          onChange={(ev) => setExercise(s.idx, eIdx, { rpe: ev.target.value })}
                                          className={inputCls} />
                                      </div>
                                    </div>
                                    <div className="mt-2">
                                      <label className={labelCls}>Notes</label>
                                      <input value={e.notes}
                                        onChange={(ev) => setExercise(s.idx, eIdx, { notes: ev.target.value })}
                                        className={inputCls} placeholder="Cues, per-leg, variations…" />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => addExercise(s.idx, false)}
                          className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-bg text-blue rounded hover:bg-border transition-colors"
                        >
                          + Exercise
                        </button>
                        <button
                          onClick={() => addExercise(s.idx, true)}
                          className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-bg text-blue rounded hover:bg-border transition-colors"
                        >
                          + Cardio
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addSession(week)}
                    className="text-[11px] font-bold uppercase tracking-wider px-3 py-2 border-2 border-dashed border-border text-muted hover:text-blue hover:border-blue rounded w-full transition-colors"
                  >
                    + Add session to week {week}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addWeek}
        className="mt-4 text-[11px] font-bold uppercase tracking-wider px-4 py-2.5 border-2 border-dashed border-border text-muted hover:text-blue hover:border-blue rounded w-full transition-colors"
      >
        + Add week {weeks.length ? Math.max(...weeks.map(([w]) => w)) + 1 : 1}
      </button>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border px-8 py-3 flex items-center justify-end gap-4 z-10">
        {error && <span className="text-[12px] text-red font-semibold mr-auto">⚠ {error}</span>}
        {savedFlash && !error && <span className="text-[12px] text-blue font-semibold">Saved ✓</span>}
        {dirty && !savedFlash && <span className="text-[11px] text-muted uppercase tracking-wider">Unsaved changes</span>}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-[12px] font-bold uppercase tracking-wider px-6 py-2.5 bg-red hover:bg-red-deep disabled:opacity-40 text-white rounded transition-colors"
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
