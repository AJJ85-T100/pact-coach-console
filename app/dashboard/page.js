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

// Parse a raw bot milestone key (e.g. "steps_5000_2026-06-21",
// "bad_week_2026-06-21", "squat_pr_2026-06-20") into a human predicate
// + a type used for the activity icon. The trailing ISO date is stripped
// because the timestamp already carries it.
function parseBotEvent(key) {
  if (!key) return { text: 'logged a milestone', type: 'generic' };
  const k = String(key).replace(/[\s_-]?\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  const low = k.toLowerCase();

  const steps = low.match(/steps?[\s_-]?(\d{3,6})/);
  if (steps) return { text: `hit ${Number(steps[1]).toLocaleString('en-GB')} steps`, type: 'steps' };

  if (/bad[\s_-]?week/.test(low)) return { text: 'flagged a tough week', type: 'badweek' };

  if (/streak/.test(low)) {
    const n = (low.match(/(\d+)/) || [])[1];
    return { text: n ? `reached a ${n}-day streak` : 'extended a streak', type: 'streak' };
  }

  if (/\bpr\b|_pr|pr_|personal[\s_-]?record/.test(low)) {
    const lift = k.replace(/[_-]/g, ' ').replace(/\bpr\b/gi, '').replace(/personal record/gi, '').trim();
    return { text: lift ? `hit a ${lift} PR` : 'hit a new PR', type: 'pr' };
  }

  const human = k.replace(/[_-]/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  return { text: human || 'logged a milestone', type: 'generic' };
}

function humaniseSlipType(type) {
  if (!type) return 'a slip';
  return type.replace(/_/g, ' ');
}

// Day bucket label for grouping the activity feed.
function dayBucketLabel(when) {
  const d = dateStrISO(new Date(when));
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d === dateStrISO(now))  return 'Today';
  if (d === dateStrISO(yest)) return 'Yesterday';
  return new Date(when).toLocaleDateString('en-GB', { weekday: 'long' });
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

  // Clients — skip the query entirely if no PT row, and always default to []
  // (Supabase returns data: null on error, which default destructuring doesn't catch).
  let clients = [];
  if (pt?.id) {
    const { data } = await service
      .from('clients')
      .select('id, name, status, current_weight, start_weight, target_weight, goal, gym, last_seen_at')
      .eq('pt_id', pt.id)
      .order('name');
    clients = data || [];
  }

  const clientIds = clients.map(c => c.id);
  const clientById = Object.fromEntries(clients.map(c => [c.id, c]));

  // Date windows
  const today = new Date();
  const todayStr = dateStrISO(today);
  const sevenAgo = new Date(today); sevenAgo.setDate(today.getDate() - 7);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const mondayStr = dateStrISO(monday);

  // 7-day window of ISO date strings, oldest → newest (for sparklines)
  const days7 = [...Array(7)].map((_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i));
    return dateStrISO(d);
  });

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
      service.from('daily_pacts')
        .select('client_id, date, status')
        .in('client_id', clientIds)
        .gte('date', dateStrISO(sevenAgo)),

      service.from('programme')
        .select('client_id, date, completed')
        .in('client_id', clientIds)
        .eq('date', todayStr),

      service.from('win_stack')
        .select('client_id, date, pact_type, description, weight, created_at')
        .in('client_id', clientIds)
        .gte('date', mondayStr)
        .order('date', { ascending: false })
        .limit(20),

      service.from('milestones')
        .select('client_id, key, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(30),

      service.from('slip_events')
        .select('client_id, event_type, detected_at')
        .in('client_id', clientIds)
        .gte('detected_at', day24Ago.toISOString())
        .order('detected_at', { ascending: false })
        .limit(20),

      service.from('conversations')
        .select('client_id, role, content, created_at')
        .in('client_id', clientIds)
        .eq('role', 'user')
        .gte('created_at', day24Ago.toISOString())
        .order('created_at', { ascending: false })
        .limit(20),

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

  // Per-client adherence (for roster pulse %) + 7-day series (for sparkline)
  const adherenceByClient = {};
  const seriesByClient = {};
  for (const id of clientIds) {
    const cp = pacts7d.filter(p => p.client_id === id);
    if (cp.length === 0) {
      adherenceByClient[id] = null;
    } else {
      const won = cp.filter(p => p.status === 'won').length;
      adherenceByClient[id] = Math.round((won / cp.length) * 100);
    }
    const byDate = Object.fromEntries(cp.map(p => [p.date, p.status]));
    seriesByClient[id] = days7.map(ds => {
      const s = byDate[ds];
      if (s === undefined) return null;
      if (s === 'won') return 1;
      if (s === 'partial') return 0.5;
      return 0;
    });
  }

  // Active this week: clients with any pact entry in last 7d
  const activeThisWeek = new Set(pacts7d.map(p => p.client_id)).size;

  // Sessions today (real from programme)
  const sessionsToday    = todayProgramme.length;
  const sessionsComplete = todayProgramme.filter(p => p.completed).length;

  // Reports drafted: weekly_pacts with this week_start
  const reportsDrafted = weeklyPactsThisWeek.length;

  // ----- Unified activity feed --------------------------------
  const milestoneEvents = milestones.map(m => {
    const p = parseBotEvent(m.key);
    return { kind: p.type, when: m.created_at, clientId: m.client_id, text: p.text };
  });
  const slipEvents = slips24h.map(s => ({
    kind: 'slip', when: s.detected_at, clientId: s.client_id,
    text: `flagged ${humaniseSlipType(s.event_type)}`,
  }));
  const messageEvents = recentMessages.map(m => {
    const body = (m.content || '').trim();
    const snip = body.slice(0, 72) + (body.length > 72 ? '…' : '');
    return { kind: 'message', when: m.created_at, clientId: m.client_id, text: `messaged: “${snip}”` };
  });

  // Merge, dedupe identical lines, cap routine step-logs so they don't flood.
  const merged = [...milestoneEvents, ...slipEvents, ...messageEvents]
    .filter(e => e.when)
    .sort((a, b) => new Date(b.when) - new Date(a.when));

  const seen = new Set();
  let stepCount = 0;
  const activity = [];
  for (const e of merged) {
    const sig = `${e.clientId}|${e.text}`;
    if (seen.has(sig)) continue;
    if (e.kind === 'steps') { if (stepCount >= 4) continue; stepCount++; }
    seen.add(sig);
    activity.push(e);
    if (activity.length >= 16) break;
  }

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
    heroSubtitle = 'No clients yet. Invite your first athlete to get started.';
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

      {/* QUICK ACTIONS — launch bar (Salesforce/Workday style) */}
      <div className="px-8 lg:px-10 pt-6">
        <QuickActions />
      </div>

      <div className="px-8 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* MAIN COLUMN (2/3) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status tiles — now clickable jump-offs */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatusTile
              label="Sessions today"
              value={sessionsToday}
              sub={sessionsToday > 0 ? `${sessionsComplete} done` : 'None scheduled'}
              href="/dashboard/briefs"
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
              href="/dashboard/reports"
            />
            <StatusTile
              label="At risk"
              value={atRiskCount}
              accent={atRiskCount > 0}
              sub={atRiskCount > 0 ? 'Action required' : 'All clear'}
              href="/dashboard/athletes"
            />
          </section>

          {/* Next session */}
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
              seriesByClient={seriesByClient}
              activeThisWeek={activeThisWeek}
            />
            <ThisWeekWins wins={wins} clientById={clientById} />
          </div>

          {/* Today's queue */}
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
function QuickActions() {
  const actions = [
    { href: '/dashboard/briefs',   label: "Today's briefs" },
    { href: '/dashboard/reports',  label: 'PAX reports' },
    { href: '/dashboard/athletes', label: 'All athletes' },
    { href: '/dashboard/programs', label: 'Build a program' },
    { href: '/dashboard/invite',   label: 'Invite client' },
  ];
  return (
    <section className="flex flex-wrap gap-2">
      {actions.map(a => (
        <Link
          key={a.href}
          href={a.href}
          className="group inline-flex items-center gap-2.5 bg-white border border-border rounded-lg px-4 py-2.5 shadow-card hover:border-blue transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red flex-shrink-0" />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-blue">{a.label}</span>
          <span className="text-red text-sm leading-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">→</span>
        </Link>
      ))}
    </section>
  );
}

function StatusTile({ label, value, sub, accent, muted, href }) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted mb-2">
          {label}
        </div>
        {href && (
          <span className="text-red text-sm leading-none opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        )}
      </div>
      <div className={`font-display font-extrabold text-3xl leading-none mb-1 ${accent ? 'text-red' : 'text-blue'}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </>
  );

  const base = `bg-white rounded-lg shadow-card p-5 border ${
    accent ? 'border-red' : muted ? 'border-border opacity-60' : 'border-border'
  }`;

  if (href && !muted) {
    return (
      <Link href={href} className={`group block ${base} hover:border-blue transition-colors`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

function NextSessionCard({ programme, clientById }) {
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

// Compact inline sparkline from a 7-slot series of {0, 0.5, 1, null}.
function Sparkline({ series, stroke }) {
  const pts = series
    .map((v, i) => ({ v, i }))
    .filter(p => p.v != null);
  if (pts.length < 2) return null;

  const W = 52, H = 16, span = (series.length - 1) || 1;
  const xy = (p) => {
    const x = (p.i / span) * W;
    const y = H - 1 - p.v * (H - 2);
    return { x, y };
  };
  const coords = pts.map(p => { const { x, y } = xy(p); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');
  const last = xy(pts[pts.length - 1]);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-1.5 mx-auto block" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="1.7" fill={stroke} />
    </svg>
  );
}

function RosterPulse({ clients, adherenceByClient, seriesByClient, activeThisWeek }) {
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
            const stroke = adh == null ? '#8A95A3' : adh >= 80 ? '#0F8A5F' : adh >= 50 ? '#D97706' : '#D92D20';
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
                <Sparkline series={seriesByClient[c.id] || []} stroke={stroke} />
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
        <QueueButton label="Pre-session briefs" count={sessionsToday} href="/dashboard/briefs" />
        <QueueButton label="Form videos"        count={0} disabled />
        <QueueButton label="Client messages"    count={0} disabled />
        <QueueButton label="At-risk follow-up"  count={atRiskCount} accent={atRiskCount > 0} disabled />
      </div>
    </div>
  );
}

function QueueButton({ label, count, accent, disabled, href }) {
  const body = (
    <>
      <div className="text-[9px] font-bold tracking-[0.15em] uppercase">{label}</div>
      <div className="font-display font-extrabold text-xl leading-none mt-2 tabular-nums">{count}</div>
    </>
  );
  const cls = `border rounded px-3 py-3 text-left block ${
    disabled
      ? 'bg-bg border-border text-muted'
      : accent
        ? 'bg-white border-red text-red'
        : 'bg-white border-border text-blue hover:border-blue transition-colors'
  }`;
  if (href && !disabled) {
    return <Link href={href} className={cls}>{body}</Link>;
  }
  return <div className={cls}>{body}</div>;
}

function ActivityFeed({ events, clientById }) {
  // Group consecutive events under day headers (Today / Yesterday / weekday).
  const groups = [];
  for (const e of events) {
    const label = dayBucketLabel(e.when);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push(e);
  }

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
        <div className="overflow-y-auto scroll-thin">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="px-5 pt-4 pb-2 text-[10px] font-bold tracking-[0.18em] uppercase text-muted bg-bg/40">
                {g.label}
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((e, i) => {
                  const c = clientById[e.clientId];
                  return (
                    <li key={i} className="px-5 py-3 flex items-start gap-3">
                      <ActivityIcon kind={e.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-blue leading-snug">
                          <span className="font-semibold">{c?.name?.split(' ')[0] || 'Athlete'}</span>{' '}
                          <span className="text-body">{e.text}</span>
                        </div>
                        <div className="text-[10px] text-muted tracking-wide uppercase mt-0.5">
                          {timeAgo(e.when)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityIcon({ kind }) {
  const map = {
    pr:       { bg: 'bg-red',         char: '★', tx: 'text-white' },
    steps:    { bg: 'bg-emerald-500', char: '↑', tx: 'text-white' },
    streak:   { bg: 'bg-red',         char: '◆', tx: 'text-white' },
    badweek:  { bg: 'bg-warn',        char: '!', tx: 'text-white' },
    slip:     { bg: 'bg-warn',        char: '!', tx: 'text-white' },
    message:  { bg: 'bg-blue',        char: '“', tx: 'text-white' },
    generic:  { bg: 'bg-blue',        char: '•', tx: 'text-white' },
  };
  const m = map[kind] || map.generic;
  return (
    <span className={`w-7 h-7 rounded grid place-items-center flex-shrink-0 text-xs font-bold ${m.bg} ${m.tx}`}>
      {m.char}
    </span>
  );
}
