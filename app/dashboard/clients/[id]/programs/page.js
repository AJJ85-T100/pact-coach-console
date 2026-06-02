'use client';

/**
 * /dashboard/clients/[id]/programs
 *
 * PT-side programs index for a specific client. Shows existing programs
 * grouped by status (active / draft / archived). "New program" toggles an
 * inline create form; on submit, POSTs to /api/clients/[id]/programs and
 * refreshes the list.
 *
 * After creation we keep the user on this page rather than navigating to
 * the editor page (which doesn't exist yet — Wave 2 of Sprint B). When the
 * editor lands, swap the create flow to redirect there.
 *
 * Assumes the existing dashboard layout chrome (sidebar, top bar) wraps
 * this page via app/dashboard/layout.js.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function ProgramsListPage() {
  const params = useParams();
  const clientId = params.id;

  const [data, setData] = useState(null);    // { client, programs }
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/programs`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load programs.');
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
  }, [clientId]);

  async function refresh() {
    const res = await fetch(`/api/clients/${clientId}/programs`);
    const json = await res.json();
    if (res.ok) setData(json);
  }

  function handleCreated() {
    setShowForm(false);
    refresh();
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

  const { client, programs } = data;
  const grouped = groupByStatus(programs);

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <Breadcrumb client={client} />

      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
            <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
              Training
            </span>
          </div>
          <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl text-[#0A2540] uppercase tracking-tight leading-none">
            Programs
          </h1>
          <p className="font-['Inter'] text-[#4A4A4A] text-sm mt-3">
            {programs.length === 0
              ? `No programs for ${client.name} yet.`
              : `${programs.length} ${programs.length === 1 ? 'programme' : 'programmes'} for ${client.name}.`}
          </p>
        </div>

        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-5 py-3 rounded-[6px] transition-colors"
          >
            <span aria-hidden="true">+</span>
            New program
          </button>
        )}
      </div>

      {showForm && (
        <CreateProgramForm
          clientId={clientId}
          onCancel={() => setShowForm(false)}
          onCreated={handleCreated}
        />
      )}

      {programs.length === 0 && !showForm ? (
        <EmptyState onCreate={() => setShowForm(true)} />
      ) : (
        <div className="space-y-8 mt-6">
          {grouped.active.length > 0 && (
            <ProgramGroup title="Active" programs={grouped.active} clientId={clientId} />
          )}
          {grouped.draft.length > 0 && (
            <ProgramGroup title="Drafts" programs={grouped.draft} clientId={clientId} />
          )}
          {grouped.archived.length > 0 && (
            <ProgramGroup title="Archived" programs={grouped.archived} clientId={clientId} />
          )}
        </div>
      )}
    </div>
  );
}

function groupByStatus(programs) {
  return programs.reduce(
    (acc, p) => {
      const key = p.status === 'active' ? 'active' : p.status === 'archived' ? 'archived' : 'draft';
      acc[key].push(p);
      return acc;
    },
    { active: [], draft: [], archived: [] },
  );
}

function Breadcrumb({ client }) {
  return (
    <nav className="mb-6 font-['Inter'] text-[12px] text-[#8A95A3] uppercase tracking-[1.5px] font-semibold">
      <Link href="/dashboard/clients" className="hover:text-[#0A2540] transition-colors">
        Clients
      </Link>
      <span className="mx-2">/</span>
      <Link href={`/dashboard/clients/${client.id}`} className="hover:text-[#0A2540] transition-colors">
        {client.name}
      </Link>
      <span className="mx-2">/</span>
      <span className="text-[#0A2540]">Programs</span>
    </nav>
  );
}

function ProgramGroup({ title, programs, clientId }) {
  return (
    <section>
      <h2 className="font-['Montserrat'] font-bold text-[11px] text-[#8A95A3] uppercase tracking-[2.5px] mb-3 pl-1">
        {title} · {programs.length}
      </h2>
      <div className="space-y-2">
        {programs.map((p) => (
          <ProgramCard key={p.id} program={p} clientId={clientId} />
        ))}
      </div>
    </section>
  );
}

function ProgramCard({ program, clientId }) {
  return (
    <Link
      href={`/dashboard/clients/${clientId}/programs/${program.id}`}
      className="group block bg-white border border-[#E2E6EB] hover:border-[#0A2540] rounded-[6px] p-5 transition-all duration-150 hover:shadow-[0_18px_40px_-12px_rgba(10,37,64,0.18)] hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-['Montserrat'] font-bold text-[#0A2540] text-base uppercase tracking-[0.3px] leading-tight mb-1.5">
            {program.name}
          </h3>
          <div className="flex items-center gap-3 flex-wrap text-[12px] font-['Inter'] text-[#8A95A3]">
            <StatusPill status={program.status} />
            {program.weeks && <span>{program.weeks} {program.weeks === 1 ? 'week' : 'weeks'}</span>}
            {program.start_date && <span>Starts {formatDate(program.start_date)}</span>}
            <span>Updated {timeAgo(program.updated_at)}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-[#D92D20] font-['Inter'] font-bold text-lg leading-none mt-1 transition-transform group-hover:translate-x-1">
          →
        </div>
      </div>
    </Link>
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

function CreateProgramForm({ clientId, onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/programs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          weeks: weeks ? parseInt(weeks, 10) : undefined,
          start_date: startDate || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create program.');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E2E6EB] rounded-[6px] p-6 mb-2">
      <h2 className="font-['Montserrat'] font-extrabold text-xl text-[#0A2540] uppercase tracking-tight mb-5">
        New program
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <FormField label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 12-Week Strength Block"
            required
            maxLength={200}
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2.5 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>

        <FormField label="Duration (weeks)">
          <input
            type="number"
            min="1"
            max="104"
            value={weeks}
            onChange={(e) => setWeeks(e.target.value)}
            placeholder="12"
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2.5 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>

        <FormField label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2.5 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors"
          />
        </FormField>
      </div>

      <FormField label="Notes for the client (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What this block is for, things to focus on…"
          rows={3}
          className="w-full bg-[#F4F6F8] border border-[#E2E6EB] rounded-[4px] px-3 py-2.5 text-sm text-[#0A2540] font-['Inter'] focus:outline-none focus:border-[#0A2540] transition-colors resize-none"
        />
      </FormField>

      {error && (
        <div className="mt-4 p-3 bg-[#F4F6F8] border-l-[3px] border-[#D92D20] rounded-[4px]">
          <p className="font-['Inter'] text-sm text-[#0A2540]">
            <span className="font-bold">Couldn't create:</span> {error}
          </p>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          disabled={!name.trim() || submitting}
          className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-5 py-3 rounded-[6px] transition-colors"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Create program
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="font-['Inter'] font-semibold text-[13px] text-[#0A2540] hover:text-[#D92D20] uppercase tracking-[0.4px] px-4 py-3 disabled:opacity-40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FormField({ label, required, children }) {
  return (
    <label className="block">
      <span className="block font-['Inter'] font-semibold text-[11px] text-[#0A2540] uppercase tracking-[1.5px] mb-1.5">
        {label}
        {required && <span className="text-[#D92D20] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="bg-white border-2 border-dashed border-[#E2E6EB] rounded-[6px] p-12 text-center mt-4">
      <div className="w-12 h-12 bg-[#0A2540] rounded-[6px] flex items-center justify-center mx-auto mb-5">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h3 className="font-['Montserrat'] font-bold text-[#0A2540] text-base uppercase tracking-tight mb-2">
        No programs yet
      </h3>
      <p className="font-['Inter'] text-[#4A4A4A] text-sm mb-5 max-w-sm mx-auto">
        Build your first programme. Sessions and exercises go inside — write the plan and PAX takes the conversation from there.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-5 py-3 rounded-[6px] transition-colors"
      >
        <span aria-hidden="true">+</span>
        New program
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tiny date helpers — light enough not to pull a date library yet.
// ----------------------------------------------------------------------------
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function timeAgo(timestamp) {
  const then = new Date(timestamp);
  const now = new Date();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(timestamp);
}
