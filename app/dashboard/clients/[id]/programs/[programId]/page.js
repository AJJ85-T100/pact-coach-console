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

import { createContext, useContext, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// Weekday labels for session day_index (1 = Mon … 7 = Sun)
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayName = (n) => DAY_NAMES[n - 1] || `Day ${n}`;

// ── Load progression ─────────────────────────────────────────────
// factor: 1.025 = +2.5%. Only plain numeric weights progress — "BW",
// "60 each", empty, and cardio prescriptions are left untouched. The
// result is rounded to the nearest 0.5kg so numbers stay loadable.
function progressWeightBy(weight, factor) {
  if (weight == null || factor === 1) return weight;
  const m = String(weight).trim().match(/^(\d+(?:\.\d+)?)\s*(kg)?$/i);
  if (!m) return weight;
  const w = parseFloat(m[1]);
  if (!w || !isFinite(w)) return weight;
  return String(Math.round(w * factor * 2) / 2);
}
function progressExercises(exercises, factor) {
  return (Array.isArray(exercises) ? exercises : []).map(({ id, ...e }) => ({
    ...e,
    weight: e.mode === 'cardio' ? e.weight : progressWeightBy(e.weight, factor),
  }));
}


// ============================================================================
// Exercise picker context + equipment matching
// ============================================================================
const ExercisePickerContext = createContext({ library: [], availableEquipment: new Set(), scanDone: false, clientId: null });

// Map free-text gym-scan equipment onto canonical tags.
const EQUIP_KEYWORDS = {
  barbell:         ['barbell', 'olympic bar'],
  rack:            ['rack', 'cage'],
  dumbbell:        ['dumbbell', 'dumbell'],
  kettlebell:      ['kettlebell', 'kettle bell'],
  machine:         ['machine', 'leg press', 'pulldown', 'pec deck', 'hack squat'],
  cable:           ['cable', 'pulley', 'crossover'],
  'smith-machine': ['smith'],
  'pull-up-bar':   ['pull-up bar', 'pull up bar', 'pullup bar', 'chin-up bar', 'chin up bar'],
  bench:           ['bench'],
  'trap-bar':      ['trap bar', 'trap-bar', 'hex bar'],
  'ez-bar':        ['ez bar', 'ez-bar', 'ez curl'],
  'medicine-ball': ['medicine ball', 'med ball', 'wall ball', 'slam ball'],
  box:             ['plyo box', 'jump box', 'plyo', 'box'],
  sled:            ['sled', 'prowler'],
  rower:           ['rower', 'row erg', 'concept2', 'concept 2'],
  bike:            ['assault bike', 'air bike', 'echo bike', 'exercise bike'],
};

function deriveAvailableEquipment(equipmentList) {
  const available = new Set();
  if (!Array.isArray(equipmentList)) return available;
  const haystack = equipmentList.filter((e) => typeof e === 'string').map((e) => e.toLowerCase());
  for (const [tag, keywords] of Object.entries(EQUIP_KEYWORDS)) {
    if (keywords.some((kw) => haystack.some((h) => h.includes(kw)))) available.add(tag);
  }
  return available;
}

// Equipment an exercise needs that the athlete doesn't appear to have.
// "bodyweight" is always available; an empty list never flags.
function missingEquipment(needed, available) {
  if (!Array.isArray(needed)) return [];
  return needed.filter((t) => t && t !== 'bodyweight' && !available.has(t));
}

export default function ProgramEditorPage() {
  const params = useParams();
  const clientId = params.id;
  const programId = params.programId;

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [library, setLibrary] = useState([]);
  const [liveFlash, setLiveFlash] = useState(false);

  // Auto-clear the "live plan updated" flash
  useEffect(() => {
    if (!liveFlash) return;
    const t = setTimeout(() => setLiveFlash(false), 4000);
    return () => clearTimeout(t);
  }, [liveFlash]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/exercises', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && Array.isArray(j.exercises)) setLibrary(j.exercises); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
    if (res.ok) {
      setData(json);
      // Every session/exercise write to an ACTIVE programme auto-rematerializes
      // the athlete's dated plan server-side — tell the coach it's already live.
      if (json?.program?.status === 'active') setLiveFlash(true);
    }
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
  const availableEquipment = deriveAvailableEquipment(client?.equipment_list);
  const scanDone = Array.isArray(client?.equipment_list) && client.equipment_list.length > 0;

  return (
    <ExercisePickerContext.Provider value={{ library, availableEquipment, scanDone, clientId }}>
      <div className="p-6 sm:p-8 max-w-7xl">
        <Breadcrumb client={client} program={program} clientId={clientId} />
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8 xl:items-start">
          <div className="min-w-0">
            <ProgramHeader
              program={program}
              sessionCount={sessions.length}
              onChange={refresh}
            />
            {program.status === 'active' && (
              <div className="mb-6 flex items-center gap-2 bg-[#0F8A5F]/10 border border-[#0F8A5F]/30 rounded-[6px] px-4 py-2.5">
                <span className="w-2 h-2 rounded-full bg-[#0F8A5F] flex-shrink-0" />
                <p className="font-['Inter'] text-[12px] text-[#0A2540]">
                  <span className="font-bold">Live programme</span> — edits here push straight to
                  {client?.name ? ` ${client.name.split(' ')[0]}'s` : " the athlete's"} plan and PAX.
                  {liveFlash && <span className="font-semibold text-[#0F8A5F]"> Saved — live plan updated.</span>}
                </p>
              </div>
            )}
            <SessionsSection
              programId={programId}
              program={program}
              sessions={sessions}
              onChange={refresh}
            />
          </div>
          <AthleteContextRail clientId={clientId} clientName={client?.name} />
        </div>
      </div>
    </ExercisePickerContext.Provider>
  );
}

// ============================================================================
// Athlete context rail — the athlete's momentum in view while programming:
// 14-day pact streak, recent wins, active pacts. Read-only; links to the hub.
// ============================================================================
function AthleteContextRail({ clientId, clientName }) {
  const [ctx, setCtx] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}/coach-context`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setCtx(j); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId]);

  if (failed) return null;
  const firstName = (clientName || '').split(' ')[0] || 'Athlete';

  const streak = Array.isArray(ctx?.streak) ? ctx.streak : [];
  const wins = Array.isArray(ctx?.wins) ? ctx.wins : [];
  const pacts = Array.isArray(ctx?.pacts) ? ctx.pacts : [];
  const kept = streak.filter((d) => d.status === 'won').length;

  const cellColor = (s) =>
    s === 'won' ? '#0F8A5F' : s === 'partial' ? '#D97706' : s ? '#D92D20' : '#E2E6EB';

  return (
    <aside className="hidden xl:block sticky top-6 space-y-4">
      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-['Montserrat'] font-bold text-[11px] text-[#0A2540] uppercase tracking-[1.5px]">
            {firstName}'s momentum
          </h3>
          <Link
            href={`/dashboard/clients/${clientId}`}
            className="font-['Inter'] text-[10px] font-semibold uppercase tracking-[1px] text-[#D92D20] hover:text-[#B0241A]"
          >
            Hub →
          </Link>
        </div>
        <p className="font-['Inter'] text-[11px] text-[#8A95A3] mb-3">
          {!ctx ? 'Loading…' : streak.length
            ? `${kept} of ${streak.length} pact days kept · last 14 days`
            : 'No pact days logged in the last 14 days'}
        </p>
        {streak.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1">
            {streak.map((d, i) => (
              <span
                key={i}
                title={`${d.date}: ${d.wins_completed ?? 0}/${d.total_wins ?? 0} wins (${d.status || '—'})`}
                className="w-4 h-4 rounded-[3px] inline-block"
                style={{ background: cellColor(d.status) }}
              />
            ))}
          </div>
        )}
      </div>

      {ctx?.weekly && (
        <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4">
          <h3 className="font-['Montserrat'] font-bold text-[11px] text-[#0A2540] uppercase tracking-[1.5px] mb-2">
            This week's pact
          </h3>
          <p className="font-['Inter'] text-[13px] text-[#0A2540] leading-snug">{ctx.weekly.pact_name}</p>
          <p className="font-['Inter'] text-[11px] text-[#8A95A3] mt-1">
            Score {ctx.weekly.pact_score ?? '—'} · {ctx.weekly.status || 'in play'}
          </p>
        </div>
      )}

      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4">
        <h3 className="font-['Montserrat'] font-bold text-[11px] text-[#0A2540] uppercase tracking-[1.5px] mb-2">
          Active pacts · {pacts.length}
        </h3>
        {pacts.length === 0 ? (
          <p className="font-['Inter'] text-[11px] text-[#8A95A3]">None set.</p>
        ) : (
          <ul className="space-y-2">
            {pacts.slice(0, 5).map((p, i) => (
              <li key={i} className="font-['Inter'] text-[12px] text-[#0A2540] leading-snug flex gap-2">
                <span className="text-[#D92D20] font-bold flex-shrink-0">·</span>
                <span className="min-w-0">
                  {p.name}
                  <span className="text-[#8A95A3]"> — streak {p.current_streak ?? 0}{p.created_by === 'athlete' ? ' · their own' : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4">
        <h3 className="font-['Montserrat'] font-bold text-[11px] text-[#0A2540] uppercase tracking-[1.5px] mb-2">
          Recent wins · 14d
        </h3>
        {wins.length === 0 ? (
          <p className="font-['Inter'] text-[11px] text-[#8A95A3]">Nothing logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {wins.slice(0, 5).map((w, i) => (
              <li key={i} className="font-['Inter'] text-[12px] text-[#0A2540] leading-snug flex gap-2">
                <span className="w-4 h-4 bg-[#0F8A5F] text-white rounded-[3px] grid place-items-center flex-shrink-0 text-[9px] font-bold">★</span>
                <span className="min-w-0">
                  {w.description || `${(w.pact_type || 'pact').replace(/_/g, ' ')} kept`}
                  <span className="text-[#8A95A3]"> · {new Date(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================
function Breadcrumb({ client, program, clientId }) {
  return (
    <nav className="mb-6 font-['Inter'] text-[12px] text-[#8A95A3] uppercase tracking-[1.5px] font-semibold">
      <Link href="/dashboard/athletes" className="hover:text-[#0A2540] transition-colors">
        Athletes
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
        Programmes
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
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [savingTpl, setSavingTpl] = useState(false);
  const router = useRouter();

  // Snapshot this programme (sessions + exercises) into the template library.
  async function saveAsTemplate() {
    if (savingTpl) return;
    setSavingTpl(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: program.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save the template.');
      setFlash({ tone: 'ok', text: `Saved to your template library as "${d.template?.name || program.name}".` });
    } catch (err) {
      setFlash({ tone: 'warn', text: `Template not saved: ${err.message}` });
    } finally {
      setSavingTpl(false);
    }
  }

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

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/programs/${program.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not delete programme.');
      }
      // Back to this athlete's programme list.
      router.push(`/dashboard/clients/${program.client_id}/programs`);
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
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
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={saveAsTemplate}
            disabled={savingTpl}
            title="Snapshot this programme (sessions + exercises) into your template library"
            className="inline-flex items-center gap-1.5 font-['Inter'] font-semibold text-[11px] text-[#0A2540] hover:text-[#D92D20] disabled:opacity-40 uppercase tracking-[0.4px] px-2 py-1 transition-colors"
          >
            {savingTpl ? 'Saving…' : 'Save as template'}
          </button>
          <button
            onClick={() => setMode('edit')}
            className="inline-flex items-center gap-1.5 font-['Inter'] font-semibold text-[11px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-2 py-1 transition-colors"
            aria-label="Edit programme details"
          >
            <EditIcon />
            Edit details
          </button>
        </div>
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

      {/* Danger zone — delete the whole programme */}
      <div className="mt-5 pt-4 border-t border-[#E2E6EB] max-w-2xl">
        {deleteConfirming ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-['Inter'] text-[13px] text-[#0A2540]">
              Delete <span className="font-bold">{program.name}</span> and all its sessions? This can&apos;t be undone.
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2 rounded-[6px] transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              onClick={() => setDeleteConfirming(false)}
              disabled={deleting}
              className="font-['Inter'] font-semibold text-[12px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-3 py-2 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirming(true)}
            className="inline-flex items-center gap-1.5 font-['Inter'] font-semibold text-[12px] text-[#8A95A3] hover:text-[#D92D20] uppercase tracking-[0.4px] transition-colors"
          >
            <TrashIcon />
            Delete programme
          </button>
        )}
        {deleteError && (
          <div className="mt-3 p-3 bg-[#F4F6F8] border-l-[3px] border-[#D92D20] rounded-[4px]">
            <p className="font-['Inter'] text-sm text-[#0A2540]">
              <span className="font-bold">Couldn&apos;t delete:</span> {deleteError}
            </p>
          </div>
        )}
      </div>
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
function SessionsSection({ programId, program, sessions, onChange }) {
  const [showAddForm, setShowAddForm] = useState(false);

  const nextWeek = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.week_number))
    : 1;

  // ── Auto-build: generate every remaining week from the last built week,
  // compounding a weekly % onto the loads. Build week 1 → one click → block done.
  const maxWeek = sessions.length ? Math.max(...sessions.map((s) => s.week_number)) : 0;
  const [buildOpen, setBuildOpen] = useState(false);
  const [buildWeeks, setBuildWeeks] = useState('');
  const [buildPct, setBuildPct] = useState('2.5');
  const [building, setBuilding] = useState(null); // week currently being written
  const [buildErr, setBuildErr] = useState(null);

  function openBuild() {
    setBuildWeeks(String(program?.weeks || Math.min(52, maxWeek + 3)));
    setBuildErr(null);
    setBuildOpen(true);
  }

  async function autoBuild() {
    const target = Math.min(52, parseInt(buildWeeks, 10) || 0);
    const pct = parseFloat(buildPct) || 0;
    const base = sessions.filter((s) => s.week_number === maxWeek);
    if (target <= maxWeek) { setBuildErr(`Already built to week ${maxWeek} — pick a higher target.`); return; }
    if (!base.length) { setBuildErr('No sessions in the last week to build from.'); return; }
    if ((target - maxWeek) * base.length > 200) { setBuildErr('That would create over 200 sessions — reduce the range.'); return; }
    setBuildErr(null);
    try {
      for (let w = maxWeek + 1; w <= target; w++) {
        setBuilding(w);
        const factor = Math.pow(1 + pct / 100, w - maxWeek); // compounds week on week
        for (const s of base) {
          const res = await fetch(`/api/programs/${programId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: s.name,
              week_number: w,
              day_index: s.day_index,
              notes: s.notes || null,
              exercises: progressExercises(s.exercises, factor),
            }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || `Week ${w} failed part-way — refresh to see what was built.`);
          }
        }
      }
      setBuildOpen(false);
      onChange();
    } catch (err) {
      setBuildErr(err.message);
      onChange(); // show whatever WAS built
    } finally {
      setBuilding(null);
    }
  }

  // Group sessions by week, preserving the API's (week_number, day_index) order.
  const weekOrder = [];
  const byWeek = new Map();
  for (const s of sessions) {
    if (!byWeek.has(s.week_number)) {
      byWeek.set(s.week_number, []);
      weekOrder.push(s.week_number);
    }
    byWeek.get(s.week_number).push(s);
  }
  weekOrder.sort((a, b) => a - b);

  return (
    <section>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] uppercase tracking-[1px]">
          Sessions
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {maxWeek >= 1 && !buildOpen && (
            <button
              onClick={openBuild}
              title="Generate all remaining weeks from the last built week, compounding a weekly % onto the loads"
              className="inline-flex items-center gap-1.5 bg-white border border-[#0A2540] hover:bg-[#0A2540] hover:text-white text-[#0A2540] font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
            >
              ⚡ Auto-build weeks
            </button>
          )}
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
      </div>

      {buildOpen && (
        <div className="bg-white border border-[#0A2540] rounded-[6px] p-5 mb-4">
          <h3 className="font-['Montserrat'] font-bold text-[12px] text-[#0A2540] uppercase tracking-[1px] mb-1">
            ⚡ Auto-build the block
          </h3>
          <p className="font-['Inter'] text-[12px] text-[#4A4A4A] mb-4 max-w-2xl">
            Takes week {maxWeek} and generates every week up to your target, adding the weekly % to each
            load (compounding, rounded to 0.5kg). Bodyweight, cardio and text loads are left untouched —
            and you can still edit any week afterwards.
          </p>
          <div className="flex items-end gap-4 flex-wrap">
            <label className="block">
              <span className="block font-['Inter'] text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A95A3] mb-1">Build up to week</span>
              <input
                value={buildWeeks}
                onChange={(e) => setBuildWeeks(e.target.value)}
                inputMode="numeric"
                className="w-24 bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540]"
              />
            </label>
            <label className="block">
              <span className="block font-['Inter'] text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A95A3] mb-1">Progress per week</span>
              <span className="flex items-center gap-1.5">
                <input
                  value={buildPct}
                  onChange={(e) => setBuildPct(e.target.value)}
                  inputMode="decimal"
                  className="w-20 bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540]"
                />
                <span className="font-['Inter'] text-sm text-[#8A95A3]">%</span>
              </span>
            </label>
            <button
              onClick={autoBuild}
              disabled={building != null}
              className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2.5 rounded-[6px] transition-colors"
            >
              {building != null ? `Building week ${building}…` : `Build weeks ${maxWeek + 1}–${Math.min(52, parseInt(buildWeeks, 10) || maxWeek + 1)}`}
            </button>
            <button
              onClick={() => setBuildOpen(false)}
              disabled={building != null}
              className="font-['Inter'] font-semibold text-[12px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-2 py-2.5 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
          </div>
          {(parseFloat(buildPct) || 0) > 0 && (parseInt(buildWeeks, 10) || 0) > maxWeek && (
            <p className="font-['Inter'] text-[11px] text-[#8A95A3] mt-3">
              Example: 100kg in week {maxWeek} → {progressWeightBy('100', Math.pow(1 + (parseFloat(buildPct) || 0) / 100, 1))}kg
              in week {maxWeek + 1} → {progressWeightBy('100', Math.pow(1 + (parseFloat(buildPct) || 0) / 100, (parseInt(buildWeeks, 10) || maxWeek + 1) - maxWeek))}kg
              by week {Math.min(52, parseInt(buildWeeks, 10) || maxWeek + 1)}.
            </p>
          )}
          {buildErr && (
            <p className="font-['Inter'] text-[12px] text-[#D92D20] mt-3">{buildErr}</p>
          )}
        </div>
      )}

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
        <div className="mt-3">
          {weekOrder.map((w) => (
            <WeekGroup
              key={w}
              weekNumber={w}
              sessions={byWeek.get(w)}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Week group — a week's sessions with drag-to-reorder.
//
// Dragging starts only from the grip handle, so it never clashes with the
// edit / delete / add-exercise controls inside a card. On drop, day_index is
// rewritten sequentially within the week and persisted through the existing
// /api/program-sessions/[id] PATCH; onChange() then refetches the authoritative
// order. Moving a session to a different week stays in the edit form, which
// already supports it.
// ============================================================================
function WeekGroup({ weekNumber, sessions, onChange }) {
  const [order, setOrder] = useState(sessions);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPct, setCopyPct] = useState('2.5');

  // Copy every session in this week into week N+1 — exercises included, with
  // an optional % load progression (0 = exact copy). Build week 1, progress
  // it forward, done.
  async function copyWeekForward(pct = 0) {
    if (copying || sessions.length === 0) return;
    setCopying(true);
    setCopyError(null);
    const factor = 1 + (parseFloat(pct) || 0) / 100;
    try {
      for (const s of sessions) {
        const res = await fetch(`/api/programs/${s.program_id}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: s.name,
            week_number: weekNumber + 1,
            day_index: s.day_index,
            notes: s.notes || null,
            // progressExercises strips ids (server issues fresh ones) and
            // leaves BW/cardio/non-numeric loads untouched.
            exercises: progressExercises(s.exercises, factor),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Could not copy a session.');
        }
      }
      setCopyOpen(false);
      onChange();
    } catch (err) {
      setCopyError(err.message);
    } finally {
      setCopying(false);
    }
  }

  // Resync to server order whenever the parent refetches.
  useEffect(() => { setOrder(sessions); }, [sessions]);

  // day_index now represents a weekday (set via the Day dropdown), so
  // sequential drag-reorder would corrupt it. Sessions render in weekday order.
  const canReorder = false;

  function reset() {
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(index)); } catch {}
  }

  function handleDragOver(e, index) {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) setOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) { reset(); return; }
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setOrder(next); // optimistic
    reset();
    persist(next);
  }

  async function persist(next) {
    const updates = [];
    next.forEach((s, i) => {
      const day = i + 1;
      if (s.day_index !== day) updates.push({ id: s.id, day_index: day });
    });
    if (updates.length === 0) return;

    setSaving(true);
    try {
      await Promise.all(updates.map((u) =>
        fetch(`/api/program-sessions/${u.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day_index: u.day_index }),
        }),
      ));
    } catch {
      // Best-effort — the refetch below resyncs to server truth regardless.
    } finally {
      setSaving(false);
      onChange();
    }
  }

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center gap-3 mb-2 px-1">
        <span className="font-['Montserrat'] font-bold text-[11px] text-[#0A2540] uppercase tracking-[2px]">
          Week {weekNumber}
        </span>
        <span className="h-px flex-1 bg-[#E2E6EB]" />
        {copyError && (
          <span className="font-['Inter'] text-[10px] text-[#D92D20] uppercase tracking-[1px]">{copyError}</span>
        )}
        {copyOpen ? (
          <span className="flex items-center gap-1.5">
            <span className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[1px]">+</span>
            <input
              value={copyPct}
              onChange={(e) => setCopyPct(e.target.value)}
              inputMode="decimal"
              className="w-12 bg-white border border-[#E2E6EB] rounded-[3px] px-1.5 py-0.5 text-[11px] text-[#0A2540] font-['Inter'] tabular-nums text-center focus:outline-none focus:border-[#0A2540]"
            />
            <span className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[1px]">% load</span>
            <button
              onClick={() => copyWeekForward(copyPct)}
              disabled={copying}
              className="font-['Inter'] font-bold text-[10px] text-white bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 uppercase tracking-[1px] px-2 py-1 rounded-[3px] transition-colors"
            >
              {copying ? 'Copying…' : `Copy → wk ${weekNumber + 1}`}
            </button>
            <button
              onClick={() => setCopyOpen(false)}
              disabled={copying}
              className="font-['Inter'] text-[11px] text-[#8A95A3] hover:text-[#0A2540] px-1"
              title="Cancel"
            >×</button>
          </span>
        ) : (
          <button
            onClick={() => setCopyOpen(true)}
            title={`Copy every week ${weekNumber} session into week ${weekNumber + 1}, with optional % load progression`}
            className="font-['Inter'] font-semibold text-[10px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[1px] transition-colors"
          >
            Copy to week {weekNumber + 1} →
          </button>
        )}
        {saving
          ? <span className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[1.5px]">Saving order…</span>
          : canReorder
            ? <span className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[1.5px]">Drag to reorder</span>
            : null}
      </div>

      <div className="space-y-3">
        {order.map((session, index) => (
          <div
            key={session.id}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            className={`flex items-stretch gap-2 rounded-[6px] transition-all ${
              dragIndex === index ? 'opacity-40' : ''
            } ${
              overIndex === index && dragIndex !== null && dragIndex !== index
                ? 'ring-2 ring-[#D92D20] ring-offset-2'
                : ''
            }`}
          >
            {canReorder && (
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={reset}
                title="Drag to reorder"
                aria-label="Drag to reorder session"
                className="flex-shrink-0 w-7 self-stretch grid place-items-center rounded-[4px] bg-[#F4F6F8] hover:bg-[#E2E6EB] text-[#8A95A3] cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripIcon />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <SessionCard session={session} onChange={onChange} />
            </div>
          </div>
        ))}
      </div>
    </div>
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

  // ── Exercise reordering: drag anywhere on a row, or use the ▲▼ arrows.
  // Order is just the JSONB array order — reorder + PATCH the whole array.
  const [exDrag, setExDrag] = useState(null);
  const [exOver, setExOver] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  async function persistOrder(next) {
    setSavingOrder(true);
    try {
      const res = await fetch(`/api/program-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercises: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save the new order.');
      }
      onChange();
    } catch (err) {
      alert(`Couldn't reorder: ${err.message}`);
    } finally {
      setSavingOrder(false);
    }
  }

  function moveExercise(from, to) {
    if (to < 0 || to >= exercises.length || from === to || savingOrder) return;
    const next = [...exercises];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    persistOrder(next);
  }

  function dropExercise(target) {
    if (exDrag == null || exDrag === target) { setExDrag(null); setExOver(null); return; }
    const from = exDrag;
    setExDrag(null); setExOver(null);
    moveExercise(from, target);
  }

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
            {exercises.map((ex, i) => (
              <div
                key={ex.id}
                draggable={!savingOrder}
                onDragStart={(e) => { setExDrag(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch {} }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (i !== exOver) setExOver(i); }}
                onDrop={(e) => { e.preventDefault(); dropExercise(i); }}
                onDragEnd={() => { setExDrag(null); setExOver(null); }}
                title="Drag to reorder"
                className={`rounded-[3px] transition-all cursor-grab active:cursor-grabbing ${
                  exDrag === i ? 'opacity-40' : ''
                } ${
                  exOver === i && exDrag != null && exDrag !== i ? 'ring-2 ring-[#D92D20] ring-offset-1' : ''
                }`}
              >
                <ExerciseRow
                  exercise={ex}
                  session={session}
                  onChange={onChange}
                  index={i}
                  count={exercises.length}
                  onMove={moveExercise}
                  busy={savingOrder}
                />
              </div>
            ))}
            {savingOrder && (
              <p className="font-['Inter'] text-[10px] text-[#8A95A3] uppercase tracking-[1.5px] px-2 pt-1">Saving order…</p>
            )}
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
  const [duplicating, setDuplicating] = useState(false);

  // One-click duplicate — same week & day, exercises included. The coach then
  // just edits the copy (rename, move day, tweak loads).
  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/programs/${session.program_id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${session.name} (copy)`,
          week_number: session.week_number,
          day_index: session.day_index,
          notes: session.notes || null,
          exercises: (Array.isArray(session.exercises) ? session.exercises : []).map(({ id, ...rest }) => rest),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not duplicate.');
      }
      onChange();
    } catch (err) {
      alert(`Couldn't duplicate: ${err.message}`);
    } finally {
      setDuplicating(false);
    }
  }

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
          W{session.week_number} · {dayName(session.day_index)}
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
            <button
              onClick={handleDuplicate}
              disabled={duplicating}
              title="Duplicate session (exercises included)"
              className="font-['Inter'] text-[10px] font-bold uppercase tracking-[1px] px-2 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-[3px] transition-colors"
            >
              {duplicating ? '…' : 'Duplicate'}
            </button>
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
          <select
            value={dayIndex}
            onChange={(e) => setDayIndex(parseInt(e.target.value, 10) || 1)}
            required
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
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
function ExerciseRow({ exercise, session, onChange, index = 0, count = 1, onMove, busy = false }) {
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

  const reps = exercise.mode === 'cardio'
    ? ([exercise.time_min ? `${exercise.time_min} min` : null,
        exercise.target_cals ? `${exercise.target_cals} kcal` : null,
        exercise.target_hr ? `@ ${exercise.target_hr} bpm` : null]
        .filter(Boolean).join(' · ') || 'cardio')
    : (exercise.reps_min && exercise.reps_max
      ? (exercise.reps_min === exercise.reps_max ? exercise.reps_min : `${exercise.reps_min}–${exercise.reps_max}`)
      : (exercise.reps_min || exercise.reps_max || '—'));

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
            {onMove && count > 1 && (
              <span className="hidden group-hover:flex items-center">
                <button
                  onClick={() => onMove(index, index - 1)}
                  disabled={busy || index === 0}
                  title="Move up"
                  className="px-0.5 text-[11px] leading-none text-[#8A95A3] hover:text-[#0A2540] disabled:opacity-25"
                >▲</button>
                <button
                  onClick={() => onMove(index, index + 1)}
                  disabled={busy || index === count - 1}
                  title="Move down"
                  className="px-0.5 text-[11px] leading-none text-[#8A95A3] hover:text-[#0A2540] disabled:opacity-25"
                >▼</button>
              </span>
            )}
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
const CARDIO_NAME_RE = /bike|row(er)?\b|erg\b|ski\b|tread|run\b|sprint|assault|airdyne|ellip|stair|cardio|swim/i;

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
  const [exMode, setExMode]   = useState(isEdit && exercise.mode === 'cardio' ? 'cardio' : 'strength');
  const [timeMin, setTimeMin] = useState(isEdit && exercise.time_min    != null ? String(exercise.time_min)    : '');
  const [cals, setCals]       = useState(isEdit && exercise.target_cals != null ? String(exercise.target_cals) : '');
  const [hr, setHr]           = useState(isEdit && exercise.target_hr   != null ? String(exercise.target_hr)   : '');
  const [videoUrl, setVideoUrl] = useState(isEdit ? (exercise.video_url || '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { library, availableEquipment, scanDone, clientId } = useContext(ExercisePickerContext);
  const [equipmentNeeded, setEquipmentNeeded] = useState(
    isEdit && Array.isArray(exercise.equipment_needed) ? exercise.equipment_needed : []
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overrideEquip, setOverrideEquip] = useState(false);
  const [creatingCustom, setCreatingCustom] = useState(false);

  // Exercise history — what this athlete actually did last time(s) with this
  // exercise, so loads are set from data, not memory. Debounced on the name.
  const [history, setHistory] = useState(null); // null | 'loading' | []
  useEffect(() => {
    const q = name.trim();
    if (!clientId || q.length < 3) { setHistory(null); return; }
    let cancelled = false;
    setHistory('loading');
    const t = setTimeout(() => {
      fetch(`/api/clients/${clientId}/exercise-history?name=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (!cancelled) setHistory(Array.isArray(j.history) ? j.history : []); })
        .catch(() => { if (!cancelled) setHistory([]); });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [name, clientId]);

  const missing = scanDone ? missingEquipment(equipmentNeeded, availableEquipment) : [];

  // Pick a library exercise: fills name + its equipment, clears any prior override.
  function selectFromLibrary(ex) {
    setName(ex.name);
    if (CARDIO_NAME_RE.test(ex.name)) setExMode('cardio');
    setEquipmentNeeded(Array.isArray(ex.equipment) ? ex.equipment : []);
    setOverrideEquip(false);
    setError(null);
    setPickerOpen(false);
  }

  // Create a custom exercise from the typed name, then select it.
  async function createCustom() {
    const typed = name.trim();
    if (!typed || creatingCustom) return;
    setCreatingCustom(true);
    setError(null);
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: typed, equipment: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create exercise.');
      selectFromLibrary(data.exercise);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingCustom(false);
    }
  }

  async function doSave() {
    setSubmitting(true);
    setError(null);
    try {
      const isCardio = exMode === 'cardio';
      const updatedExercise = {
        id: isEdit ? exercise.id : `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        mode:        isCardio ? 'cardio' : null,
        time_min:    isCardio && timeMin ? parseInt(timeMin, 10) : null,
        target_cals: isCardio && cals    ? parseInt(cals, 10)    : null,
        target_hr:   isCardio && hr      ? parseInt(hr, 10)      : null,
        sets:         !isCardio && sets    ? parseInt(sets, 10)    : null,
        reps_min:     !isCardio && repsMin ? parseInt(repsMin, 10) : null,
        reps_max:     !isCardio && repsMax ? parseInt(repsMax, 10) : null,
        weight:       !isCardio ? (weight.trim() || null) : null,
        rpe:          !isCardio && rpe     ? parseFloat(rpe)       : null,
        rest_seconds: rest    ? parseInt(rest, 10)    : null,
        tempo:        !isCardio ? (tempo.trim() || null) : null,
        notes:        notes.trim() || null,
        video_url:    videoUrl.trim() || null,
        equipment_needed: equipmentNeeded,
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

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    // Equipment confirm-gate: if the athlete's kit doesn't cover it, the warning
    // + "Add anyway" below take over until the coach confirms.
    if (missing.length > 0 && !overrideEquip) return;
    doSave();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] p-4 mt-2">
      <h4 className="font-['Montserrat'] font-bold text-[12px] text-[#0A2540] uppercase tracking-[1px] mb-3">
        {isEdit ? 'Edit exercise' : 'New exercise'}
      </h4>

      <div className="relative">
        <FormField label="Exercise" required>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setEquipmentNeeded([]); setOverrideEquip(false); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
            required
            maxLength={120}
            autoComplete="off"
            placeholder="Search the library or type your own…"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-3 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>

        {pickerOpen && (
          <ExercisePickerDropdown
            query={name}
            library={library}
            availableEquipment={availableEquipment}
            scanDone={scanDone}
            creatingCustom={creatingCustom}
            onPick={selectFromLibrary}
            onCreateCustom={createCustom}
          />
        )}

        {equipmentNeeded.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {equipmentNeeded.map((tag) => {
              const unmet = tag !== 'bodyweight' && scanDone && !availableEquipment.has(tag);
              return (
                <span
                  key={tag}
                  className={`text-[10px] font-['Inter'] font-semibold uppercase tracking-[1px] px-2 py-0.5 rounded-[3px] ${
                    unmet ? 'bg-[#FEE2E0] text-[#D92D20]' : 'bg-[#EBF1F5] text-[#0A2540]'
                  }`}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}

        {Array.isArray(history) && history.length > 0 && (
          <div className="mt-2 bg-white border-l-[3px] border-[#0A2540] rounded-[0_4px_4px_0] px-3 py-2">
            <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[1.2px] text-[#8A95A3] mb-1">
              Last time{history.length > 1 ? 's' : ''} — logged sets
            </div>
            <ul className="space-y-0.5">
              {history.map((h, i) => (
                <li key={i} className="font-['Inter'] text-[12px] text-[#0A2540] tabular-nums">
                  <span className="text-[#8A95A3]">
                    {new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} —{' '}
                  </span>
                  {h.sets.map((s) => `${s.weight != null ? `${s.weight}kg` : 'BW'}×${s.reps ?? '—'}`).join(', ')}
                  {h.top_set?.rpe != null && <span className="text-[#8A95A3]"> @ RPE {h.top_set.rpe}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Strength / Cardio prescription toggle */}
      <div className="flex gap-1 mt-3">
        {['strength', 'cardio'].map((m) => (
          <button key={m} type="button" onClick={() => setExMode(m)}
            className={`px-3 py-1.5 rounded-[4px] text-[10px] font-['Inter'] font-bold uppercase tracking-[0.8px] transition-colors ${
              exMode === m ? 'bg-[#0A2540] text-white' : 'bg-white border border-[#E2E6EB] text-[#0A2540]'
            }`}>
            {m === 'strength' ? 'Sets × reps' : 'Cardio · time / kcal / HR'}
          </button>
        ))}
      </div>

      {exMode === 'cardio' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <FormField label="Time (min)">
            <input type="number" min="1" max="600" value={timeMin} onChange={(e) => setTimeMin(e.target.value)}
              placeholder="12"
              className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors" />
          </FormField>
          <FormField label="Calories">
            <input type="number" min="1" max="5000" value={cals} onChange={(e) => setCals(e.target.value)}
              placeholder="150"
              className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors" />
          </FormField>
          <FormField label="Target HR (bpm)">
            <input type="number" min="60" max="220" value={hr} onChange={(e) => setHr(e.target.value)}
              placeholder="145"
              className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors" />
          </FormField>
          <FormField label="Rest (s)">
            <input type="number" min="0" max="1800" value={rest} onChange={(e) => setRest(e.target.value)}
              placeholder="60"
              className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] tabular-nums focus:outline-none focus:border-[#0A2540] transition-colors" />
          </FormField>
        </div>
      )}

      {exMode === 'strength' && (
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
      )}

      <div className="mt-3">
        <FormField label="Demo video URL (YouTube or MP4 — plays in the athlete's logger)">
          <input
            type="url"
            value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        {exMode === 'strength' && (
        <FormField label="Tempo">
          <input
            type="text"
            value={tempo} onChange={(e) => setTempo(e.target.value)}
            placeholder="3-1-2-1"
            className="w-full bg-white border border-[#E2E6EB] rounded-[4px] px-2 py-2 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
        )}
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

      {missing.length > 0 && (
        <div className="mt-3 p-3 bg-[#FFF8EB] border-l-[3px] border-[#D97706] rounded-[4px]">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            The client does not appear to have{' '}
            <span className="font-bold">{missing.join(', ')}</span>. Are you sure you wish to add this?
          </p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {missing.length > 0 ? (
          <button
            type="button"
            onClick={() => { setOverrideEquip(true); doSave(); }}
            disabled={!name.trim() || submitting}
            className="inline-flex items-center gap-2 bg-[#D97706] hover:bg-[#B45309] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2 rounded-[6px] transition-colors"
          >
            {submitting ? 'Saving…' : 'Add anyway'}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.4px] px-4 py-2 rounded-[6px] transition-colors"
          >
            {submitting ? 'Saving…' : (isEdit ? 'Save changes' : 'Add exercise')}
          </button>
        )}
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
// Exercise picker dropdown — searchable library with equipment availability
// ============================================================================
function ExercisePickerDropdown({ query, library, availableEquipment, scanDone, creatingCustom, onPick, onCreateCustom }) {
  const q = (query || '').trim().toLowerCase();
  const matches = (q ? library.filter((ex) => ex.name.toLowerCase().includes(q)) : library).slice(0, 8);
  const exactMatch = library.some((ex) => ex.name.toLowerCase() === q);
  const showCreate = q.length > 0 && !exactMatch;

  return (
    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#E2E6EB] rounded-[6px] shadow-[0_18px_40px_-12px_rgba(10,37,64,0.18)] max-h-72 overflow-y-auto">
      {matches.length === 0 && !showCreate && (
        <div className="px-3 py-3 font-['Inter'] text-[13px] text-[#8A95A3]">No matches.</div>
      )}
      {matches.map((ex) => {
        const miss = scanDone ? missingEquipment(ex.equipment, availableEquipment) : [];
        return (
          <button
            key={ex.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(ex)}
            className="w-full text-left px-3 py-2 hover:bg-[#F4F6F8] border-b border-[#E2E6EB] last:border-b-0 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-['Inter'] font-medium text-[13px] text-[#0A2540] truncate">{ex.name}</span>
              {ex.is_custom && (
                <span className="flex-shrink-0 text-[9px] font-['Inter'] font-bold uppercase tracking-[1px] text-[#8A95A3]">Custom</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {(ex.equipment || []).map((tag) => (
                <span key={tag} className="text-[9px] font-['Inter'] uppercase tracking-[0.5px] text-[#8A95A3]">{tag}</span>
              ))}
              {scanDone && (
                miss.length > 0
                  ? <span className="text-[9px] font-['Inter'] font-semibold uppercase tracking-[0.5px] text-[#D92D20]">· needs {miss.join(', ')}</span>
                  : <span className="text-[9px] font-['Inter'] font-semibold uppercase tracking-[0.5px] text-[#0F8A5F]">· in kit</span>
              )}
            </div>
          </button>
        );
      })}
      {showCreate && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCreateCustom}
          disabled={creatingCustom}
          className="w-full text-left px-3 py-2.5 border-t border-[#E2E6EB] hover:bg-[#F4F6F8] font-['Inter'] text-[13px] text-[#D92D20] font-semibold disabled:opacity-50 transition-colors"
        >
          {creatingCustom ? 'Adding…' : `+ Add “${query.trim()}” as a custom exercise`}
        </button>
      )}
    </div>
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

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
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
