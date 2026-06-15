'use client';

/**
 * /dashboard/clients/[id]/programs/[programId]
 *
 * Program editor — Wave 2c: status transitions and inline metadata editing
 * on top of Wave 2b (add/edit/delete on sessions and exercises).
 *
 * UX patterns:
 * - Add: button → inline form expands → submit → form closes, page refreshes
 * - Edit: pencil icon on row/header → form replaces display inline → submit → done
 * - Delete: trash icon → button transforms to "Confirm?" → second click deletes,
 *           any other interaction cancels
 * - Status: draft → "Activate" (red CTA) auto-archives any prior active; active
 *           → "Archive programme" with inline confirm; archived → "Restore to draft"
 *
 * Still deferred:
 * - Delete programme entirely (DELETE /api/programs/[programId])
 * - Drag-to-reorder sessions
 * - Sidebar Programs link → top-level /dashboard/programs roster view
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ProgramEditorPage() {
  const params = useParams();
  const clientId = params.id;
  const programId = params.programId;

  const [data, setData] = useState(null);
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
      <ProgramHeader
        program={program}
        sessionCount={sessions.length}
        onChange={refresh}
      />
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
      <Link href="/dashboard/athletes" className="hover:text-[#0A2540] transition-colors">
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
// Program header — name, metadata, status, edit + transition controls
// ============================================================================
function ProgramHeader({ program, sessionCount, onChange }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [archiveConfirming, setArchiveConfirming] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [flash, setFlash] = useState(null); // { tone: 'ok' | 'warn', text }

  // Auto-cancel archive confirm after 3s of no interaction
  useEffect(() => {
    if (!archiveConfirming) return;
    const t = setTimeout(() => setArchiveConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [archiveConfirming]);

  // Auto-clear flash after 4s
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function patchStatus(nextStatus) {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change status.');

      if (nextStatus === 'active' && data.autoArchivedCount > 0) {
        setFlash({
          tone: 'warn',
          text: `Activated. Previous active programme${data.autoArchivedCount === 1 ? '' : 's'} archived.`,
        });
      } else {
        setFlash({
          tone: 'ok',
          text: nextStatus === 'active'   ? 'Programme activated.'
              : nextStatus === 'archived' ? 'Programme archived.'
              :                              'Restored to draft.',
        });
      }
      setArchiveConfirming(false);
      onChange();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusBusy(false);
    }
  }

  if (mode === 'edit') {
    return (
      <div className="mb-8">
        <ProgramMetadataForm
          program={program}
          onCancel={() => setMode('view')}
          onDone={() => {
            setMode('view');
            setFlash({ tone: 'ok', text: 'Programme details saved.' });
            onChange();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          Programme
        </span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl text-[#0A2540] uppercase tracking-tight leading-none">
          {program.name}
        </h1>
        <button
          onClick={() => setMode('edit')}
          className="inline-flex items-center gap-1.5 font-['Inter'] font-semibold text-[11px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-2 py-1 transition-colors"
          aria-label="Edit programme details"
        >
          <EditIcon />
          Edit details
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[12px] font-['Inter'] text-[#8A95A3] mb-4">
        <StatusPill status={program.status} />
        {program.weeks && <span>{program.weeks} {program.weeks === 1 ? 'week' : 'weeks'}</span>}
        {program.start_date && <span>Starts {formatDate(program.start_date)}</span>}
        <span>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</span>
      </div>

      {program.notes && (
        <p className="mb-4 text-[14px] text-[#4A4A4A] font-['Inter'] max-w-3xl leading-relaxed">
          {program.notes}
        </p>
      )}

      {/* Status transition actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {program.status === 'draft' && (
          <>
            <button
              onClick={() => patchStatus('active')}
              disabled={statusBusy}
              className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
            >
              {statusBusy ? 'Activating…' : 'Activate programme'}
            </button>
            <button
              onClick={() => patchStatus('archived')}
              disabled={statusBusy}
              className="font-['Inter'] font-semibold text-[12px] text-[#8A95A3] hover:text-[#0A2540] uppercase tracking-[0.4px] px-3 py-2.5 disabled:opacity-40 transition-colors"
            >
              Archive
            </button>
          </>
        )}

        {program.status === 'active' && (
          archiveConfirming ? (
            <>
              <button
                onClick={() => patchStatus('archived')}
                disabled={statusBusy}
                className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
              >
                {statusBusy ? 'Archiving…' : 'Confirm archive'}
              </button>
              <button
                onClick={() => setArchiveConfirming(false)}
                disabled={statusBusy}
                className="font-['Inter'] font-semibold text-[12px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-3 py-2.5 disabled:opacity-40 transition-colors"
              >
                Keep active
              </button>
            </>
          ) : (
            <button
              onClick={() => setArchiveConfirming(true)}
              className="inline-flex items-center gap-2 bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
            >
              Archive programme
            </button>
          )
        )}

        {program.status === 'archived' && (
          <button
            onClick={() => patchStatus('draft')}
            disabled={statusBusy}
            className="inline-flex items-center gap-2 bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] disabled:opacity-40 transition-colors"
          >
            {statusBusy ? 'Restoring…' : 'Restore to draft'}
          </button>
        )}
      </div>

      {statusError && (
        <div className="mt-3 p-3 bg-[#F4F6F8] border-l-[3px] border-[#D92D20] rounded-[4px] max-w-2xl">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            <span className="font-bold">Couldn't change status:</span> {statusError}
          </p>
        </div>
      )}

      {flash && (
        <div className={`mt-3 p-3 rounded-[4px] max-w-2xl border-l-[3px] ${
          flash.tone === 'warn'
            ? 'bg-[#FFF8EB] border-[#D97706]'
            : 'bg-[#F4F6F8] border-[#0F8A5F]'
        }`}>
          <p className="font-['Inter'] text-sm text-[#0A2540]">{flash.text}</p>
        </div>
      )}
    </div>
  );
}

// Edit metadata form (name, weeks, start_date, notes)
function ProgramMetadataForm({ program, onCancel, onDone }) {
  const [name, setName] = useState(program.name || '');
  const [weeks, setWeeks] = useState(program.weeks ?? '');
  const [startDate, setStartDate] = useState(program.start_date || '');
  const [notes, setNotes] = useState(program.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        weeks: weeks === '' ? null : Number(weeks),
        start_date: startDate || null,
        notes: notes.trim() || null,
      };
      const res = await fetch(`/api/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E6EB] rounded-[6px] p-5">
      <h3 className="font-['Montserrat'] font-bold text-base text-[#0A2540] uppercase tracking-tight mb-4">
        Edit programme details
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <FormField label="Name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. 12-Week Strength Block"
              className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
            />
          </FormField>
        </div>
        <FormField label="Weeks">
          <input
            type="number" min="1" max="52"
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            placeholder="12"
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
      </div>
      <FormField label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Block focus, periodisation notes, things to revisit at week 4…"
          className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors resize-none"
        />
      </FormField>

      {error && (
        <div className="mt-3 p-3 bg-[#F4F6F8] border-l-[3px] border-[#D92D20] rounded-[4px]">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            <span className="font-bold">Couldn't save:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
        >
          {submitting ? 'Saving…' : 'Save changes'}
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
// Sessions section
// ============================================================================
function SessionsSection({ programId, sessions, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);

  const nextWeek = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.week_number))
    : 1;

  return (
    <section>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] uppercase tracking-[1px]">
          Sessions
        </h2>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
          >
            <span aria-hidden="true">+</span>
            Add session
          </button>
        )}
      </div>

      {showAddForm && (
        <SessionForm
          mode="add"
          programId={programId}
          defaultWeek={nextWeek}
          onCancel={() => setShowAddForm(false)}
          onDone={() => { setShowAddForm(false); onChange(); }}
        />
      )}

      {sessions.length === 0 && !showAddForm ? (
        <EmptySessions onAdd={() => setShowAddForm(true)} />
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

// ============================================================================
// Session card — display + edit + delete state machine per session
// ============================================================================
function SessionCard({ session, onChange }) {
  const [mode, setMode] = useState('view');  // view | edit
  const [showAddExercise, setShowAddExercise] = useState(false);
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];

  if (mode === 'edit') {
    return (
      <div className="bg-white border border-[#0A2540] rounded-[6px] overflow-hidden">
        <SessionForm
          mode="edit"
          session={session}
          onCancel={() => setMode('view')}
          onDone={() => { setMode('view'); onChange(); }}
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[6px] overflow-hidden">
      <SessionHeader
        session={session}
        exerciseCount={exercises.length}
        onEdit={() => setMode('edit')}
        onChange={onChange}
      />

      {session.notes && (
        <div className="px-5 py-3 bg-[#F4F6F8] border-b border-[#E2E6EB]">
          <p className="font-['Inter'] text-[13px] text-[#4A4A4A] italic">{session.notes}</p>
        </div>
      )}

      <div className="px-5 py-4">
        {exercises.length === 0 ? (
          <p className="font-['Inter'] text-[13px] text-[#8A95A3] italic mb-3">
            No exercises yet.
          </p>
        ) : (
          <div className="mb-3 space-y-1">
            <div className="grid grid-cols-12 gap-2 px-2 pb-2 border-b border-[#E2E6EB] font-['Inter'] text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A95A3]">
              <div className="col-span-4">Exercise</div>
              <div className="col-span-1 text-center">Sets</div>
              <div className="col-span-2 text-center">Reps</div>
              <div className="col-span-2 text-center">Weight</div>
              <div className="col-span-1 text-center">RPE</div>
              <div className="col-span-1 text-center">Rest</div>
              <div className="col-span-1"></div>
            </div>
            {exercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                session={session}
                onChange={onChange}
              />
            ))}
          </div>
        )}

        {showAddExercise ? (
          <ExerciseForm
            mode="add"
            session={session}
            onCancel={() => setShowAddExercise(false)}
            onDone={() => { setShowAddExercise(false); onChange(); }}
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

function SessionHeader({ session, exerciseCount, onEdit, onChange }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Cancel delete confirm after 3 seconds of inactivity
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/program-sessions/${session.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not delete.');
      }
      onChange();
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`);
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-[#0A2540] text-white px-5 py-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-['Montserrat'] font-bold text-[10px] uppercase tracking-[2px] text-white/60 px-2 py-1 bg-white/10 rounded-[3px] flex-shrink-0">
          W{session.week_number} · D{session.day_index}
        </span>
        <h3 className="font-['Montserrat'] font-bold text-[15px] uppercase tracking-[0.3px] truncate">
          {session.name}
        </h3>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-['Inter'] text-[11px] text-white/50 uppercase tracking-[1.5px] font-semibold">
          {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
        </span>
        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="font-['Inter'] text-[11px] text-white uppercase tracking-[1.5px] font-semibold mr-1">
              Delete?
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="font-['Inter'] text-[11px] font-bold uppercase tracking-[1px] px-2 py-1 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-50 text-white rounded-[3px] transition-colors"
            >
              {deleting ? '…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="font-['Inter'] text-[11px] font-bold uppercase tracking-[1px] px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded-[3px] transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <IconButton onClick={onEdit} title="Edit session" variant="white">
              <EditIcon />
            </IconButton>
            <IconButton onClick={() => setConfirming(true)} title="Delete session" variant="white-danger">
              <TrashIcon />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Session form — handles both add and edit modes
// ============================================================================
function SessionForm({ mode, programId, session, defaultWeek, onCancel, onDone }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(isEdit ? session.name : '');
  const [weekNumber, setWeekNumber] = useState(isEdit ? session.week_number : (defaultWeek || 1));
  const [dayIndex, setDayIndex] = useState(isEdit ? session.day_index : 1);
  const [notes, setNotes] = useState(isEdit ? (session.notes || '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        name: name.trim(),
        week_number: weekNumber,
        day_index: dayIndex,
        notes: notes.trim() || null,
      };

      const url = isEdit
        ? `/api/program-sessions/${session.id}`
        : `/api/programs/${programId}/sessions`;
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save session.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E6EB] rounded-[6px] p-5 mb-2">
      <h3 className="font-['Montserrat'] font-bold text-base text-[#0A2540] uppercase tracking-tight mb-4">
        {isEdit ? 'Edit session' : 'New session'}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <FormField label="Week" required>
          <input
            type="number" min="1" max="52"
            value={weekNumber}
            onChange={(e) => setWeekNumber(parseInt(e.target.value, 10) || 1)}
            required
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        <FormField label="Day" required>
          <input
            type="number" min="1" max="7"
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
            <span className="font-bold">Couldn't save:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
        >
          {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Add session')}
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
// Exercise row — display + edit/delete state machine per exercise
// ============================================================================
function ExerciseRow({ exercise, session, onChange }) {
  const [mode, setMode] = useState('view');  // view | edit
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const currentExercises = Array.isArray(session.exercises) ? session.exercises : [];
      const newExercises = currentExercises.filter((e) => e.id !== exercise.id);

      const res = await fetch(`/api/program-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: newExercises }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not delete.');
      }
      onChange();
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (mode === 'edit') {
    return (
      <div className="my-2">
        <ExerciseForm
          mode="edit"
          session={session}
          exercise={exercise}
          onCancel={() => setMode('view')}
          onDone={() => { setMode('view'); onChange(); }}
        />
      </div>
    );
  }

  const reps = exercise.reps_min && exercise.reps_max
    ? (exercise.reps_min === exercise.reps_max ? exercise.reps_min : `${exercise.reps_min}–${exercise.reps_max}`)
    : (exercise.reps_min || exercise.reps_max || '—');

  return (
    <div className="grid grid-cols-12 gap-2 px-2 py-2 items-center font-['Inter'] text-[13px] text-[#0A2540] rounded-[3px] hover:bg-[#F4F6F8] transition-colors group">
      <div className="col-span-4 font-medium truncate" title={exercise.name}>{exercise.name}</div>
      <div className="col-span-1 text-center tabular-nums">{exercise.sets ?? '—'}</div>
      <div className="col-span-2 text-center tabular-nums">{reps}</div>
      <div className="col-span-2 text-center text-[12px]">{exercise.weight || '—'}</div>
      <div className="col-span-1 text-center tabular-nums text-[12px]">{exercise.rpe ?? '—'}</div>
      <div className="col-span-1 text-center tabular-nums text-[12px]">
        {exercise.rest_seconds != null ? `${exercise.rest_seconds}s` : '—'}
      </div>
      <div className="col-span-1 flex items-center justify-end gap-1">
        {confirming ? (
          <>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Confirm delete"
              className="font-['Inter'] text-[10px] font-bold uppercase tracking-[1px] px-1.5 py-0.5 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-50 text-white rounded-[3px] transition-colors"
            >
              {deleting ? '…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              title="Cancel"
              className="font-['Inter'] text-[10px] font-bold uppercase tracking-[1px] px-1.5 py-0.5 bg-[#E2E6EB] hover:bg-[#D0D6DD] text-[#0A2540] rounded-[3px] transition-colors"
            >
              No
            </button>
          </>
        ) : (
          <>
            <IconButton onClick={() => setMode('edit')} title="Edit exercise" variant="gray">
              <EditIcon />
            </IconButton>
            <IconButton onClick={() => setConfirming(true)} title="Delete exercise" variant="gray-danger">
              <TrashIcon />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Exercise form — handles both add and edit modes
// ============================================================================
function ExerciseForm({ mode, session, exercise, onCancel, onDone }) {
  const isEdit = mode === 'edit';
  const [name, setName]       = useState(isEdit ? exercise.name : '');
  const [sets, setSets]       = useState(isEdit && exercise.sets != null ? String(exercise.sets) : '');
  const [repsMin, setRepsMin] = useState(isEdit && exercise.reps_min != null ? String(exercise.reps_min) : '');
  const [repsMax, setRepsMax] = useState(isEdit && exercise.reps_max != null ? String(exercise.reps_max) : '');
  const [weight, setWeight]   = useState(isEdit ? (exercise.weight || '') : '');
  const [rpe, setRpe]         = useState(isEdit && exercise.rpe != null ? String(exercise.rpe) : '');
  const [rest, setRest]       = useState(isEdit && exercise.rest_seconds != null ? String(exercise.rest_seconds) : '');
  const [tempo, setTempo]     = useState(isEdit ? (exercise.tempo || '') : '');
  const [notes, setNotes]     = useState(isEdit ? (exercise.notes || '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updatedExercise = {
        id: isEdit ? exercise.id : `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        sets:         sets    ? parseInt(sets, 10)    : null,
        reps_min:     repsMin ? parseInt(repsMin, 10) : null,
        reps_max:     repsMax ? parseInt(repsMax, 10) : null,
        weight:       weight.trim() || null,
        rpe:          rpe     ? parseFloat(rpe)       : null,
        rest_seconds: rest    ? parseInt(rest, 10)    : null,
        tempo:        tempo.trim() || null,
        notes:        notes.trim() || null,
        equipment_needed: isEdit && Array.isArray(exercise.equipment_needed) ? exercise.equipment_needed : [],
      };

      const currentExercises = Array.isArray(session.exercises) ? session.exercises : [];
      const newExercises = isEdit
        ? currentExercises.map((e) => e.id === exercise.id ? updatedExercise : e)
        : [...currentExercises, updatedExercise];

      const res = await fetch(`/api/program-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: newExercises }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save exercise.');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] p-4 mt-2">
      <h4 className="font-['Montserrat'] font-bold text-[12px] text-[#0A2540] uppercase tracking-[1px] mb-3">
        {isEdit ? 'Edit exercise' : 'New exercise'}
      </h4>

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
            <span className="font-bold">Couldn't save:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2 rounded-[6px] transition-colors"
        >
          {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Add exercise')}
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
// Small reusable components
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

function IconButton({ onClick, title, variant, children }) {
  const styles = {
    'gray':          'text-[#8A95A3] hover:text-[#0A2540] hover:bg-[#E2E6EB]',
    'gray-danger':   'text-[#8A95A3] hover:text-[#D92D20] hover:bg-[#FEE2E0]',
    'white':         'text-white/70 hover:text-white hover:bg-white/10',
    'white-danger':  'text-white/70 hover:text-white hover:bg-[#D92D20]',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-7 h-7 rounded-[3px] grid place-items-center transition-colors ${styles[variant] || styles.gray}`}
    >
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

// ============================================================================
// Date helpers
// ============================================================================
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
