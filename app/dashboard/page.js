import Link from 'next/link';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================================
// Helpers
// ============================================================
function greetingForHour(h) {
  if (h < 5)  return 'Late one';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late one';
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function dateStrISO(d) {
  return d.toLocaleDateString('en-CA');
}

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

// Humanise milestone keys → "Squat PR" etc
function humaniseMilestoneKey(key) {
  if (!key) return 'Milestone';
  return key
    .replace(/_/g, ' ')
    .replace(/\bpr\b/gi, 'PR')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Humanise slip event_type
function humaniseSlipType(type) {
  if (!type) return 'Slip';
  return type.replace(/_/g, ' ');
}

// ============================================================
// Page
// ============================================================
export default async function MyDayPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const service = createServiceClient();

  // PT row
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, business_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Clients
  const { data: clients = [] } = await service
    .from('clients')
    .select('id, name, status, current_weight, start_weight, target_weight, goal, gym, last_seen_at')
    .eq('pt_id', pt?.id || null)
    .order('name');

  const clientIds = clients.map(c => c.id);
  const clientById = Object.fromEntries(clients.map(c => [c.id, c]));

  // Date windows
  const today = new Date();
  const todayStr = dateStrISO(today);
  const sevenAgo = new Date(today); sevenAgo.setDate(today.getDate() - 7);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const mondayStr = dateStrISO(monday);

  // ============================================================
  // Aggregate queries (skipped if no clients to avoid empty IN)
  // ============================================================
  let pacts7d = [], todayProgramme = [], wins = [], milestones = [];
  let slips24h = [], recentMessages = [], weeklyPactsThisWeek = [];

  if (clientIds.length > 0) {
    const day24Ago = new Date(today); day24Ago.setDate(today.getDate() - 1);

    const [
      pactsR, programmeR, winsR, milestonesR,
      slipsR, msgsR, weeklyR,
    ] = await Promise.all([
      // Daily pacts last 7 days for adherence
      service.from('daily_pacts')
        .select('client_id, date, status')
        .in('client_id', clientIds)
        .gte('date', dateStrISO(sevenAgo)),

      // Programme entries scheduled today
      service.from('programme')
        .select('client_id, date, completed')
        .in('client_id', clientIds)
        .eq('date', todayStr),

      // Wins this week from win_stack
      service.from('win_stack')
        .select('client_id, date, pact_type, description, weight, created_at')
        .in('client_id', clientIds)
        .gte('date', mondayStr)
        .order('date', { ascending: false })
        .limit(20),

      // Recent milestones for activity feed
      service.from('milestones')
        .select('client_id, key, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(20),

      // Recent slip events for activity feed
      service.from('slip_events')
        .select('client_id, event_type, detected_at')
        .in('client_id', clientIds)
        .gte('detected_at', day24Ago.toISOString())
        .order('detected_at', { ascending: false })
        .limit(20),

      // Recent user messages for activity feed (1 per athlete to avoid spam)
      service.from('conversations')
        .select('client_id, role, content, created_at')
        .in('client_id', clientIds)
        .eq('role', 'user')
        .gte('created_at', day24Ago.toISOString())
        .order('created_at', { ascending: false })
        .limit(20),

      // Weekly pacts created this week (proxy for "reports drafted")
      service.from('weekly_pacts')
        .select('client_id, week_start, status, pact_score')
        .in('client_id', clientIds)
        .eq('week_start', mondayStr),
    ]);

    pacts7d              = pactsR.data    || [];
    todayProgramme       = programmeR.data || [];
    wins                 = winsR.data     || [];
    milestones           = milestonesR.data || [];
    slips24h             = slipsR.data    || [];
    recentMessages       = msgsR.data     || [];
    weeklyPactsThisWeek  = weeklyR.data   || [];
  }

  // ============================================================
  // Derive
  // ============================================================
  const total       = clients.length;
  const atRiskCount = clients.filter(c => c.status === 'at_risk').length;

  // Per-client adherence map (for roster pulse)
  const adherenceByClient = {};
  for (const id of clientIds) {
    const cp = pacts7d.filter(p => p.client_id === id);
    if (cp.length === 0) {
      adherenceByClient[id] = null;
    } else {
      const won = cp.filter(p => p.status === 'won').length;
      adherenceByClient[id] = Math.round((won / cp.length) * 100);
    }
  }

  // Active this week: clients with any pact entry in last 7d
  const activeThisWeek = new Set(pacts7d.map(p => p.client_id)).size;

  // Sessions today (real from programme)
  const sessionsToday    = todayProgramme.length;
  const sessionsComplete = todayProgramme.filter(p => p.completed).length;

  // Reports drafted: weekly_pacts with this week_start that have a score
  const reportsDrafted = weeklyPactsThisWeek.length;

  // Build unified activity feed (last ~24h)
  const activity = [
    ...milestones.map(m => ({
      kind: 'milestone',
      when: m.created_at,
      clientId: m.client_id,
      content: humaniseMilestoneKey(m.key),
    })),
    ...slips24h.map(s => ({
      kind: 'slip',
      when: s.detected_at,
      clientId: s.client_id,
      content: `Slip · ${humaniseSlipType(s.event_type)}`,
    })),
    ...recentMessages.map(m => ({
      kind: 'message',
      when: m.created_at,
      clientId: m.client_id,
      content: m.content?.slice(0, 80) + (m.content?.length > 80 ? '…' : ''),
    })),
  ]
    .sort((a, b) => new Date(b.when) - new Date(a.when))
    .slice(0, 12);

  // Greeting copy
  const firstName = pt?.name?.split(' ')[0] || 'Coach';
  const now       = new Date();
  const greeting  = greetingForHour(now.getHours());
  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).toUpperCase();
  const timeLabel = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });

  // Smart subtitle
  let heroSubtitle;
  if (total === 0) {
    heroSubtitle = "No clients yet. Invite your first athlete to get started.";
  } else if (sessionsToday > 0) {
    heroSubtitle = `${sessionsToday} session${sessionsToday === 1 ? '' : 's'} scheduled today.${atRiskCount > 0 ? ` ${atRiskCount} client${atRiskCount === 1 ? '' : 's'} need${atRiskCount === 1 ? 's' : ''} attention.` : ''}`;
  } else if (atRiskCount > 0) {
    const names = clients.filter(c => c.status === 'at_risk').map(c => c.name.split(' ')[0]).join(', ');
    heroSubtitle = `${total} athletes in your roster. ${atRiskCount} need attention — ${names}.`;
  } else {
    heroSubtitle = `${total} athletes in your roster. All on track.`;
  }

  return (
    <>
      {/* DARK HERO BAND */}
      <section className="bg-blue text-white px-8 lg:px-10 py-10 lg:py-12">
        <p className="text-[11px] font-semibold text-red tracking-[0.25em] uppercase mb-3">
          {dateLabel} · {timeLabel}
        </p>
        <h1 className="font-display font-extrabold text-4xl lg:text-5xl uppercase tracking-tight leading-[0.95] mb-3">
          {greeting}, {firstName}.
        </h1>
        <p className="text-white/70 text-sm lg:text-base max-w-2xl leading-relaxed">
          {heroSubtitle}
        </p>
      </section>

      <div className="px-8 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* MAIN COLUMN (2/3) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status tiles */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatusTile
              label="Sessions today"
              value={sessionsToday}
              sub={sessionsToday > 0 ? `${sessionsComplete} done` : 'None scheduled'}
            />
            <StatusTile
              label="Form reviews"
              value={0}
              sub="Coming soon"
              muted
            />
            <StatusTile
              label="Reports drafted"
              value={reportsDrafted}
              sub={reportsDrafted > 0 ? `for week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Build the week ahead'}
            />
            <StatusTile
              label="At risk"
              value={atRiskCount}
              accent={atRiskCount > 0}
              sub={atRiskCount > 0 ? 'Action required' : 'All clear'}
            />
          </section>

          {/* Next session — placeholder until we have real scheduling */}
          {sessionsToday > 0 ? (
            <NextSessionCard programme={todayProgramme} clientById={clientById} />
          ) : (
            <NoSessionsPlaceholder />
          )}

          {/* Roster pulse + Wins side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RosterPulse
              clients={clients}
              adherenceByClient={adherenceByClient}
              activeThisWeek={activeThisWeek}
            />
            <ThisWeekWins wins={wins} clientById={clientById} />
          </div>

          {/* Today's queue — visual placeholder actions */}
          <TodaysQueue
            atRiskCount={atRiskCount}
            sessionsToday={sessionsToday}
          />
        </div>

        {/* ACTIVITY FEED (1/3) */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <ActivityFeed events={activity} clientById={clientById} />
          </div>
        </aside>

      </div>
    </>
  );
}

// ============================================================
// Components
// ============================================================
function StatusTile({ label, value, sub, accent, muted }) {
  return (
    <div className={`bg-white rounded-lg shadow-card p-5 border ${
      accent ? 'border-red' : muted ? 'border-border opacity-60' : 'border-border'
    }`}>
      <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted mb-2">
        {label}
      </div>
      <div className={`font-display font-extrabold text-3xl leading-none mb-1 ${
        accent ? 'text-red' : 'text-blue'
      }`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function NextSessionCard({ programme, clientById }) {
  // Show first programme entry as the "next session"
  const next = programme[0];
  const client = clientById[next?.client_id];

  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">
          Next session
        </h3>
        {client && (
          <Link href={`/dashboard/clients/${client.id}`} className="text-[10px] font-semibold uppercase tracking-wider text-red hover:text-red-deep">
            Open full brief →
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="bg-blue text-white rounded p-3 text-center min-w-[80px]">
          <div className="text-[10px] font-bold tracking-wider uppercase opacity-80">Today</div>
          <div className="font-display font-extrabold text-lg leading-none">{programme.length}</div>
          <div className="text-[10px] tracking-wider uppercase opacity-80 mt-1">total</div>
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-blue text-base">
            {client?.name || 'Client'}
          </div>
          <div className="text-xs text-muted">
            {client?.goal?.replace(/_/g, ' ') || 'session'}
            {programme.length > 1 && <> · +{programme.length - 1} more today</>}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoSessionsPlaceholder() {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em] mb-3">
        Today's calendar
      </h3>
      <p className="text-sm text-muted">
        No sessions scheduled today. PAX is on the line if any of your athletes need a check-in.
      </p>
    </div>
  );
}

function RosterPulse({ clients, adherenceByClient, activeThisWeek }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">
          Roster pulse · {activeThisWeek} active
        </h3>
        <Link href="/dashboard/athletes" className="text-[10px] font-semibold uppercase tracking-wider text-red hover:text-red-deep">
          All clients →
        </Link>
      </div>
      {clients.length === 0 ? (
        <p className="text-muted text-xs">No clients yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {clients.map(c => {
            const adh = adherenceByClient[c.id];
            const accent = adh == null
              ? 'border-border bg-bg text-muted'
              : adh >= 80
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : adh >= 50
                  ? 'border-warn bg-warn-light text-warn-dark'
                  : 'border-red/40 bg-red/10 text-red';
            return (
              <Link
                key={c.id}
                href={`/dashboard/clients/${c.id}`}
                className={`border rounded p-2 text-center transition-transform hover:scale-105 ${accent}`}
              >
                <div className="font-display font-bold text-xs leading-none">{initials(c.name)}</div>
                <div className="font-display font-extrabold text-sm leading-none mt-1.5 tabular-nums">
                  {adh != null ? `${adh}%` : '—'}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThisWeekWins({ wins, clientById }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">
          This week's wins · {wins.length}
        </h3>
      </div>
      {wins.length === 0 ? (
        <p className="text-muted text-xs">No wins logged this week yet. There's still time.</p>
      ) : (
        <ul className="space-y-3">
          {wins.slice(0, 4).map((w, i) => {
            const c = clientById[w.client_id];
            return (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="w-5 h-5 bg-emerald-500 text-white rounded grid place-items-center flex-shrink-0 text-[10px] font-bold">★</span>
                <div className="min-w-0">
                  <div className="text-blue leading-snug">
                    <span className="font-semibold">{c?.name?.split(' ')[0] || 'Athlete'}</span>
                    {w.description ? ` — ${w.description}` : ` kept their ${w.pact_type || 'pact'}`}
                  </div>
                  <div className="text-[10px] text-muted tracking-wide uppercase mt-0.5">
                    {timeAgo(w.created_at || w.date)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TodaysQueue({ atRiskCount, sessionsToday }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">
          Today's queue
        </h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <QueueButton label="Pre-session briefs" count={sessionsToday} disabled={sessionsToday === 0} />
        <QueueButton label="Form videos"        count={0} disabled />
        <QueueButton label="Client messages"    count={0} disabled />
        <QueueButton label="At-risk follow-up"  count={atRiskCount} accent={atRiskCount > 0} disabled />
      </div>
    </div>
  );
}

function QueueButton({ label, count, accent, disabled }) {
  return (
    <div
      className={`border rounded px-3 py-3 text-left ${
        disabled
          ? 'bg-bg border-border text-muted'
          : accent
            ? 'bg-white border-red text-red'
            : 'bg-white border-border text-blue hover:border-blue cursor-pointer'
      }`}
    >
      <div className="text-[9px] font-bold tracking-[0.15em] uppercase">{label}</div>
      <div className="font-display font-extrabold text-xl leading-none mt-2 tabular-nums">{count}</div>
    </div>
  );
}

function ActivityFeed({ events, clientById }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border" style={{ maxHeight: 'calc(100vh - 3rem)' }}>
      <div className="px-5 py-4 border-b border-border">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-red mb-1">
          Live · Last 24h
        </p>
        <h3 className="font-display font-extrabold text-blue text-lg uppercase tracking-tight">
          Activity
        </h3>
      </div>
      {events.length === 0 ? (
        <div className="p-5 text-muted text-xs">
          Nothing in the last 24 hours. Quiet day.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto scroll-thin">
          {events.map((e, i) => {
            const c = clientById[e.clientId];
            return (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <ActivityIcon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-blue leading-snug">
                    <span className="font-semibold">{c?.name?.split(' ')[0] || 'Athlete'}</span>
                    {' · '}
                    <span className="text-body">{e.content}</span>
                  </div>
                  <div className="text-[10px] text-muted tracking-wide uppercase mt-0.5">
                    {timeAgo(e.when)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityIcon({ kind }) {
  const map = {
    milestone: { bg: 'bg-red',         char: '★', tx: 'text-white' },
    slip:      { bg: 'bg-warn',        char: '!', tx: 'text-white' },
    message:   { bg: 'bg-blue',        char: '◌', tx: 'text-white' },
  };
  const m = map[kind] || map.message;
  return (
    <span className={`w-7 h-7 rounded grid place-items-center flex-shrink-0 text-xs font-bold ${m.bg} ${m.tx}`}>
      {m.char}
    </span>
  );
}
