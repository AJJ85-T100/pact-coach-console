/**
 * /dashboard/programs
 *
 * Top-level programme roster across the coach's whole athlete list.
 * Activates the previously-disabled "Programs" link in the sidebar.
 *
 * Read-only: each row links through to the existing editor at
 * /dashboard/clients/[clientId]/programs/[programId].
 *
 * Coach scoping: programmes are reached via the coach's clients
 * (clients.pt_id === pt.id) rather than programs.pt_id, since that
 * column is nullable. Two cheap queries + an in-memory join keeps this
 * robust whether or not a DB foreign key is declared.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_ORDER = { active: 0, draft: 1, archived: 2 };

export default async function ProgramsRosterPage() {
  // Belt-and-braces auth — middleware bounces, but don't trust that here.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();

  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, business_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // The coach's athletes
  const { data: clients = [] } = await service
    .from('clients')
    .select('id, name')
    .eq('pt_id', pt?.id || null);

  const clientIds = (clients || []).map((c) => c.id);
  const clientName = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));

  // Every programme belonging to those athletes
  let programs = [];
  if (clientIds.length > 0) {
    const { data: progRows = [] } = await service
      .from('programs')
      .select('id, client_id, name, status, weeks, start_date, updated_at')
      .in('client_id', clientIds);
    programs = progRows || [];
  }

  // Session counts per programme — one query, tally in memory
  const programIds = programs.map((p) => p.id);
  const sessionCount = {};
  if (programIds.length > 0) {
    const { data: sess = [] } = await service
      .from('program_sessions')
      .select('program_id')
      .in('program_id', programIds);
    for (const s of sess || []) {
      sessionCount[s.program_id] = (sessionCount[s.program_id] || 0) + 1;
    }
  }

  // Active first, then draft, then archived; most-recently-updated within each
  programs.sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  const activeCount = programs.filter((p) => p.status === 'active').length;

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      {/* Header */}
      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          Workspace
        </span>
      </div>
      <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl text-[#0A2540] uppercase tracking-tight leading-none mb-2">
        Programs
      </h1>
      <p className="font-['Inter'] text-[14px] text-[#4A4A4A] mb-8">
        Every programme across your roster
        {pt?.business_name ? ` at ${pt.business_name}` : ''}.{' '}
        <span className="text-[#0A2540] font-semibold">{programs.length}</span> total
        {' · '}
        <span className="text-[#0A2540] font-semibold">{activeCount}</span> active.
      </p>

      {programs.length === 0 ? (
        <EmptyRoster />
      ) : (
        <div className="bg-white border border-[#E2E6EB] rounded-[6px] overflow-hidden shadow-[0_4px_10px_rgba(10,37,64,0.05)]">
          {/* Column header (sm+) */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-[#F4F6F8] border-b border-[#E2E6EB] font-['Inter'] text-[10px] font-bold uppercase tracking-[1.5px] text-[#8A95A3]">
            <div className="col-span-4">Programme</div>
            <div className="col-span-3">Athlete</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-center">Weeks</div>
            <div className="col-span-2 text-center">Sessions</div>
          </div>

          {programs.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/clients/${p.client_id}/programs/${p.id}`}
              className="grid grid-cols-2 sm:grid-cols-12 gap-3 px-5 py-4 border-b border-[#E2E6EB] last:border-b-0 items-center hover:bg-[#F4F6F8] transition-colors group"
            >
              <div className="col-span-2 sm:col-span-4 min-w-0">
                <div className="font-['Montserrat'] font-bold text-[15px] text-[#0A2540] uppercase tracking-[0.2px] truncate group-hover:text-[#D92D20] transition-colors">
                  {p.name}
                </div>
                {p.start_date && (
                  <div className="font-['Inter'] text-[11px] text-[#8A95A3] mt-0.5">
                    Starts {formatDate(p.start_date)}
                  </div>
                )}
              </div>
              <div className="col-span-1 sm:col-span-3 font-['Inter'] text-[13px] text-[#4A4A4A] truncate">
                {clientName[p.client_id] || '—'}
              </div>
              <div className="col-span-1 sm:col-span-2">
                <StatusPill status={p.status} />
              </div>
              <div className="hidden sm:block sm:col-span-1 text-center font-['Inter'] text-[13px] text-[#4A4A4A] tabular-nums">
                {p.weeks || '—'}
              </div>
              <div className="hidden sm:block sm:col-span-2 text-center font-['Inter'] text-[13px] text-[#4A4A4A] tabular-nums">
                {sessionCount[p.id] || 0}
              </div>
            </Link>
          ))}
        </div>
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

function EmptyRoster() {
  return (
    <div className="bg-white border-2 border-dashed border-[#E2E6EB] rounded-[6px] p-12 text-center">
      <h2 className="font-['Montserrat'] font-bold text-[#0A2540] text-lg uppercase tracking-tight mb-2">
        No programmes yet
      </h2>
      <p className="font-['Inter'] text-[#4A4A4A] text-sm max-w-md mx-auto mb-6">
        Programmes you build for your athletes show up here. Open an athlete and create their first block to get started.
      </p>
      <Link
        href="/dashboard/athletes"
        className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-5 py-3 rounded-[6px] transition-colors"
      >
        Go to athletes
      </Link>
    </div>
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
