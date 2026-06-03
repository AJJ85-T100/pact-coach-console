'use client';

/**
 * /dashboard/clients/[id]/programs/[programId]
 *
 * Program editor. Loads program + sessions via GET /api/programs/[programId].
 * Add session: POST /api/programs/[programId]/sessions
 * Add exercise: PATCH /api/program-sessions/[sessionId] with full new exercises array.
 *
 * Out of scope for Wave 2a (will land in 2b):
 * - Editing session metadata / deleting sessions
 * - Editing / deleting individual exercises
 * - Editing program metadata
 * - Status transitions (draft → active → archived)
 * - Drag-to-reorder
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ProgramEditorPage() {
  const params = useParams();
  const clientId = params.id;
  const programId = params.programId;

  const [data, setData] = useState(null);   // { program, sessions, client }
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/programs/${programId}?t=${Date.now()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load program.');
        if (!cancelled) {
          setData(json);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  async function refresh() {
    const res = await fetch(`/api/programs/${programId}?t=${Date.now()}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok) setData(json);
  }

  if (loadError) {
    return (
      <div className="p-6 sm:p-8">
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4 max-w-2xl">
          <p className="font-['Montserrat'] font-bold text-[11px] text-[#D92D20] uppercase tracking-[1.5px] mb-1">
            Couldn't load
          </p>
          <p className="font-['Inter'] text-sm text-[#0A2540]">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 sm:p-8">
        <p className="font-['Inter'] text-sm text-[#8A95A3]">Loading…</p>
      </div>
    );
  }

  const { program, sessions, client } = data;

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <Breadcrumb client={client} program={program} clientId={clientId} />
      <ProgramHeader program={program} sessionCount={sessions.length} />
      <SessionsSection
        programId={programId}
        sessions={sessions}
        onChange={refresh}
      />
    </div>
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================
function Breadcrumb({ client, program, clientId }) {
  return (
    <nav className="mb-6 font-['Inter'] text-[12px] text-[#8A95A3] uppercase tracking-[1.5px] font-semibold">
      <Link href="/dashboard/clients" className="hover:text-[#0A2540] transition-colors">
        Clients
      </Link>
      <span className="mx-2">/</span>
      {client && (
        <>
          <Link href={`/dashboard/clients/${clientId}`} className="hover:text-[#0A2540] transition-colors">
            {client.name}
          </Link>
          <span className="mx-2">/</span>
        </>
      )}
      <Link href={`/dashboard/clients/${clientId}/programs`} className="hover:text-[#0A2540] transition-colors">
        Programs
      </Link>
      <span className="mx-2">/</span>
      <span className="text-[#0A2540]">{program.name}</span>
    </nav>
  );
}

// ============================================================================
// Program header — read-only metadata for Wave 2a
// ============================================================================
function ProgramHeader({ program, sessionCount }) {
  return (
    <div className="mb-8">
      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          Programme
        </span>
      </div>
      <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl text-[#0A2540] uppercase tracking-tight leading-none mb-4">
        {program.name}
      </h1>
      <div className="flex items-center gap-3 flex-wrap text-[12px] font-['Inter'] text-[#8A95A3]">
        <StatusPill status={program.status} />
        {program.weeks && <span>{program.weeks} {program.weeks === 1 ? 'week' : 'weeks'}</span>}
        {program.start_date && <span>Starts {formatDate(program.start_date)}</span>}
        <span>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</span>
      </div>
      {program.notes && (
        <p className="mt-4 text-[14px] text-[#4A4A4A] font-['Inter'] max-w-3xl leading-relaxed">
          {program.notes}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    active:   'bg-[#0F8A5F] text-white',
    draft:    'bg-[#E2E6EB] text-[#0A2540]',
    archived: 'bg-[#8A95A3] text-white',
  };
  return (
    <span className={`text-[10px] font-['Montserrat'] font-bold uppercase tracking-[1.5px] px-2 py-0.5 rounded-[3px] ${styles[status] || styles.draft}`}>
      {status}
    </span>
  );
}

// ============================================================================
// Sessions section — list + add session form
// ============================================================================
function SessionsSection({ programId, sessions, onChange }) {
  const [showForm, setShowForm] = useState(false);

  // Default next session's week to the highest existing week (or 1)
  const nextWeek = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.week_number))
    : 1;

  return (
    <section>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] uppercase tracking-[1px]">
          Sessions
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
          >
            <span aria-hidden="true">+</span>
            Add session
          </button>
        )}
      </div>

      {showForm && (
        <AddSessionForm
          programId={programId}
          defaultWeek={nextWeek}
          onCancel={() => setShowForm(false)}
          onAdded={() => { setShowForm(false); onChange(); }}
        />
      )}

      {sessions.length === 0 && !showForm ? (
        <EmptySessions onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-3 mt-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptySessions({ onAdd }) {
  return (
    <div className="bg-white border-2 border-dashed border-[#E2E6EB] rounded-[6px] p-10 text-center mt-3">
      <h3 className="font-['Montserrat'] font-bold text-[#0A2540] text-base uppercase tracking-tight mb-2">
        No sessions yet
      </h3>
      <p className="font-['Inter'] text-[#4A4A4A] text-sm mb-5 max-w-sm mx-auto">
        Build the programme out one session at a time. Each session is a workout — assign it to a week and a day.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-5 py-3 rounded-[6px] transition-colors"
      >
        <span aria-hidden="true">+</span>
        Add first session
      </button>
    </div>
  );
}

function AddSessionForm({ programId, defaultWeek, onCancel, onAdded }) {
  const [name, setName] = useState('');
  const [weekNumber, setWeekNumber] = useState(defaultWeek);
  const [dayIndex, setDayIndex] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/programs/${programId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          week_number: weekNumber,
          day_index: dayIndex,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add session.');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E6EB] rounded-[6px] p-5 mb-2">
      <h3 className="font-['Montserrat'] font-bold text-base text-[#0A2540] uppercase tracking-tight mb-4">
        New session
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <FormField label="Week" required>
          <input
            type="number"
            min="1"
            max="52"
            value={weekNumber}
            onChange={(e) => setWeekNumber(parseInt(e.target.value, 10) || 1)}
            required
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Day" required>
          <input
            type="number"
            min="1"
            max="7"
            value={dayIndex}
            onChange={(e) => setDayIndex(parseInt(e.target.value, 10) || 1)}
            required
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <div className="col-span-2">
          <FormField label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. Upper Body Push"
              className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
            />
          </FormField>
        </div>
      </div>
      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Tempo focus, RPE target, things to coach this session…"
          className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors resize-none"
        />
      </FormField>

      {error && (
        <div className="mt-3 p-3 bg-[#F4F6F8] border-l-[3px] border-[#D92D20] rounded-[4px]">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            <span className="font-bold">Couldn't add:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
        >
          {submitting ? 'Adding…' : 'Add session'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="font-['Inter'] font-semibold text-[12px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-3 py-2.5 disabled:opacity-40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Session card — displays one session with its exercises and add-exercise form
// ============================================================================
function SessionCard({ session, onChange }) {
  const [showAddExercise, setShowAddExercise] = useState(false);
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];

  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[6px] overflow-hidden">
      {/* Session header strip */}
      <div className="bg-[#0A2540] text-white px-5 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="font-['Montserrat'] font-bold text-[10px] uppercase tracking-[2px] text-white/60 px-2 py-1 bg-white/10 rounded-[3px]">
            W{session.week_number} · D{session.day_index}
          </span>
          <h3 className="font-['Montserrat'] font-bold text-[15px] uppercase tracking-[0.3px]">
            {session.name}
          </h3>
        </div>
        <span className="font-['Inter'] text-[11px] text-white/50 uppercase tracking-[1.5px] font-semibold">
          {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
        </span>
      </div>

      {/* Notes if present */}
      {session.notes && (
        <div className="px-5 py-3 bg-[#F4F6F8] border-b border-[#E2E6EB]">
          <p className="font-['Inter'] text-[13px] text-[#4A4A4A] italic">{session.notes}</p>
        </div>
      )}

      {/* Exercises */}
      <div className="px-5 py-4">
        {exercises.length === 0 ? (
          <p className="font-['Inter'] text-[13px] text-[#8A95A3] italic mb-3">
            No exercises yet.
          </p>
        ) : (
          <div className="mb-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 px-2 pb-2 border-b border-[#E2E6EB] font-['Inter'] text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A95A3]">
              <div className="col-span-4">Exercise</div>
              <div className="col-span-2 text-center">Sets</div>
              <div className="col-span-2 text-center">Reps</div>
              <div className="col-span-2 text-center">Weight</div>
              <div className="col-span-1 text-center">RPE</div>
              <div className="col-span-1 text-center">Rest</div>
            </div>
            {exercises.map((ex) => (
              <ExerciseRow key={ex.id} exercise={ex} />
            ))}
          </div>
        )}

        {showAddExercise ? (
          <AddExerciseForm
            session={session}
            onCancel={() => setShowAddExercise(false)}
            onAdded={() => { setShowAddExercise(false); onChange(); }}
          />
        ) : (
          <button
            onClick={() => setShowAddExercise(true)}
            className="font-['Inter'] font-semibold text-[12px] text-[#D92D20] hover:text-[#B0241A] uppercase tracking-[0.4px] transition-colors"
          >
            + Add exercise
          </button>
        )}
      </div>
    </div>
  );
}

function ExerciseRow({ exercise }) {
  const reps = exercise.reps_min && exercise.reps_max
    ? (exercise.reps_min === exercise.reps_max ? exercise.reps_min : `${exercise.reps_min}–${exercise.reps_max}`)
    : (exercise.reps_min || exercise.reps_max || '—');

  return (
    <div className="grid grid-cols-12 gap-2 px-2 py-2 items-center font-['Inter'] text-[13px] text-[#0A2540] rounded-[3px] hover:bg-[#F4F6F8] transition-colors">
      <div className="col-span-4 font-medium">{exercise.name}</div>
      <div className="col-span-2 text-center tabular-nums">{exercise.sets ?? '—'}</div>
      <div className="col-span-2 text-center tabular-nums">{reps}</div>
      <div className="col-span-2 text-center text-[12px]">{exercise.weight || '—'}</div>
      <div className="col-span-1 text-center tabular-nums text-[12px]">{exercise.rpe ?? '—'}</div>
      <div className="col-span-1 text-center tabular-nums text-[12px]">
        {exercise.rest_seconds != null ? `${exercise.rest_seconds}s` : '—'}
      </div>
    </div>
  );
}

// ============================================================================
// Add-exercise inline form — PATCHes the session with the new exercises array
// ============================================================================
function AddExerciseForm({ session, onCancel, onAdded }) {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('');
  const [repsMin, setRepsMin] = useState('');
  const [repsMax, setRepsMax] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');
  const [rest, setRest] = useState('');
  const [tempo, setTempo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const newExercise = {
        id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        sets:         sets    ? parseInt(sets, 10)        : null,
        reps_min:     repsMin ? parseInt(repsMin, 10)     : null,
        reps_max:     repsMax ? parseInt(repsMax, 10)     : null,
        weight:       weight.trim() || null,
        rpe:          rpe     ? parseFloat(rpe)           : null,
        rest_seconds: rest    ? parseInt(rest, 10)        : null,
        tempo:        tempo.trim() || null,
        notes:        notes.trim() || null,
        equipment_needed: [],
      };

      const currentExercises = Array.isArray(session.exercises) ? session.exercises : [];
      const newExercises = [...currentExercises, newExercise];

      const res = await fetch(`/api/program-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: newExercises }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add exercise.');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] p-4 mt-2">
      <h4 className="font-['Montserrat'] font-bold text-[12px] text-[#0A2540] uppercase tracking-[1px] mb-3">
        New exercise
      </h4>

      {/* Row 1: name (full width) */}
      <FormField label="Exercise name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="e.g. Back Squat"
          className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
        />
      </FormField>

      {/* Row 2: prescription grid */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-3">
        <FormField label="Sets">
          <input
            type="number" min="1" max="20"
            value={sets} onChange={(e) => setSets(e.target.value)}
            placeholder="4"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Reps min">
          <input
            type="number" min="1" max="100"
            value={repsMin} onChange={(e) => setRepsMin(e.target.value)}
            placeholder="6"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Reps max">
          <input
            type="number" min="1" max="100"
            value={repsMax} onChange={(e) => setRepsMax(e.target.value)}
            placeholder="8"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Weight">
          <input
            type="text"
            value={weight} onChange={(e) => setWeight(e.target.value)}
            placeholder="70kg"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="RPE">
          <input
            type="number" step="0.5" min="1" max="10"
            value={rpe} onChange={(e) => setRpe(e.target.value)}
            placeholder="7"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Rest (s)">
          <input
            type="number" min="0" max="1800"
            value={rest} onChange={(e) => setRest(e.target.value)}
            placeholder="180"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
      </div>

      {/* Row 3: tempo + notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        <FormField label="Tempo">
          <input
            type="text"
            value={tempo} onChange={(e) => setTempo(e.target.value)}
            placeholder="3-1-2-1"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Notes">
            <input
              type="text"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Sit back, knees out, full depth…"
              className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
            />
          </FormField>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-white border-l-[3px] border-[#D92D20] rounded-[4px]">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            <span className="font-bold">Couldn't add:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2 rounded-[6px] transition-colors"
        >
          {submitting ? 'Adding…' : 'Add exercise'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="font-['Inter'] font-semibold text-[12px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-3 py-2 disabled:opacity-40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Small helpers
// ============================================================================
function FormField({ label, required, children }) {
  return (
    <label className="block">
      <span className="block font-['Inter'] font-semibold text-[10px] text-[#0A2540] uppercase tracking-[1.5px] mb-1">
        {label}
        {required && <span className="text-[#D92D20] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
