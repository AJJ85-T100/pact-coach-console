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

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function dateStrISO(d) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ============================================================
// Per-athlete data fetch
// Pulls latest steps/protein/mood/sleep/sessions/nutrition/trend/risk/progress
// ============================================================
async function fetchAthleteData(service, client) {
  const now = new Date();
  const sevenAgo = new Date(now); sevenAgo.setDate(now.getDate() - 7);
  const fourteenAgo = new Date(now); fourteenAgo.setDate(now.getDate() - 14);

  const sevenAgoStr    = dateStrISO(sevenAgo);
  const fourteenAgoStr = dateStrISO(fourteenAgo);

  const [healthR, moodR, pactsR, slipsR, programmeR, weighR] = await Promise.all([
    service.from('health_data').select('steps, protein, calories, raw, created_at, date')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(7),
    service.from('mood_ratings').select('rating, date, created_at')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(1),
    service.from('daily_pacts').select('date, status')
      .eq('client_id', client.id).gte('date', fourteenAgoStr),
    service.from('slip_events').select('id, detected_at')
      .eq('client_id', client.id).gte('detected_at', sevenAgo.toISOString()),
    service.from('programme').select('completed, date')
      .eq('client_id', client.id).gte('date', sevenAgoStr),
    service.from('weigh_ins').select('weight, date, created_at')
      .eq('client_id', client.id).not('weight', 'is', null)
      .order('created_at', { ascending: false }).limit(1),
  ]);

  // Latest health snapshot
  const healthRecent = healthR.data || [];
  const latestHealth = healthRecent[0] || {};
  const sleep = latestHealth.raw?.sleep ?? null;

  // Today / latest mood
  const mood = moodR.data?.[0]?.rating ?? null;

  // Pacts trend (this week vs last)
  const pacts = pactsR.data || [];
  const thisWeekWon = pacts.filter(p => p.date >= sevenAgoStr && p.status === 'won').length;
  const lastWeekWon = pacts.filter(p => p.date < sevenAgoStr && p.status === 'won').length;

  let trend = 'steady';
  if (thisWeekWon > lastWeekWon + 1) trend = 'building';
  else if (thisWeekWon < lastWeekWon - 1) trend = 'declining';

  // Sessions adherence this week
  const programmeWeek = programmeR.data || [];
  const sessionsTotal     = programmeWeek.length;
  const sessionsCompleted = programmeWeek.filter(p => p.completed).length;
  const sessionPct = sessionsTotal ? Math.round((sessionsCompleted / sessionsTotal) * 100) : 0;

  // Nutrition adherence — days logged in last 7
  const daysLogged = healthRecent.filter(h => h.calories && h.calories > 0).length;
  const nutritionPct = Math.round((daysLogged / 7) * 100);

  // Slips this week
  const slipsThisWeek = slipsR.data?.length || 0;

  // Risk classification
  const risk = (client.status === 'at_risk' || slipsThisWeek >= 3) ? 'high'
             : slipsThisWeek > 0 ? 'medium' : 'low';

  // Readiness score (0-100) — sleep-driven for now, can be extended with HRV
  let readiness;
  if (sleep == null)        readiness = 60;
  else if (sleep <= 4)      readiness = 28;
  else if (sleep <= 5)      readiness = 45;
  else if (sleep <= 6)      readiness = 62;
  else if (sleep <= 7)      readiness = 78;
  else if (sleep <= 8)      readiness = 88;
  else                      readiness = 95;

  // Weight progress
  const currentWeight = weighR.data?.[0]?.weight ?? client.current_weight;
  const lost = (client.start_weight != null && currentWeight != null)
    ? +(client.start_weight - currentWeight).toFixed(1)
    : null;
  const toGo = (currentWeight != null && client.target_weight != null)
    ? +(currentWeight - client.target_weight).toFixed(1)
    : null;

  return {
    ...client,
    steps: latestHealth.steps ?? 0,
    protein: latestHealth.protein ?? 0,
    mood,
    sleep,
    readiness,
    sessionPct,
    nutritionPct,
    slipsThisWeek,
    pactsWonThisWeek: thisWeekWon,
    trend,
    risk,
    currentWeight,
    lost,
    toGo,
    isAtRisk: risk === 'high',
  };
}

// ============================================================
// Page
// ============================================================
export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const service = createServiceClient();

  // PT row
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, business_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Clients for this PT
  const { data: clients = [] } = await service
    .from('clients')
    .select('*')
    .eq('pt_id', pt?.id || null)
    .order('name');

  // Hydrate each client with computed metrics
  const athletes = await Promise.all(
    (clients || []).map(c => fetchAthleteData(service, c))
  );

  // Headline numbers
  const total       = athletes.length;
  const atRiskCount = athletes.filter(a => a.isAtRisk).length;
  const onTrackCount = athletes.filter(a => !a.isAtRisk).length;
  const activeThisWeek = athletes.filter(a => a.pactsWonThisWeek > 0).length;

  // Pacts won today (only query if we have athletes)
  let pactsWonToday = 0;
  if (athletes.length > 0) {
    const todayStr = dateStrISO(new Date());
    const { data: pactsToday = [] } = await service
      .from('daily_pacts')
      .select('id')
      .eq('date', todayStr)
      .eq('status', 'won')
      .in('client_id', athletes.map(a => a.id));
    pactsWonToday = pactsToday?.length || 0;
  }

  // Header copy
  const firstName = pt?.name?.split(' ')[0] || 'Coach';
  const now       = new Date();
  const greeting  = greetingForHour(now.getHours());
  const dateLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).toUpperCase();
  const timeLabel = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });

  // Build a smart hero subtitle
  let heroSubtitle;
  if (total === 0) {
    heroSubtitle = "No clients linked yet. Invite your first athlete to get started.";
  } else if (atRiskCount > 0) {
    const atRiskNames = athletes.filter(a => a.isAtRisk).map(a => a.name.split(' ')[0]).join(', ');
    heroSubtitle = `${total} athletes in your roster. ${atRiskCount} need attention — ${atRiskNames}.`;
  } else {
    heroSubtitle = `${total} athletes in your roster. All on track.`;
  }

  return (
    <>
      {/* Dark hero band */}
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

      <div className="px-8 lg:px-10 py-8 space-y-8">

        {/* Status tiles */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatusTile label="Total clients"    value={total} />
          <StatusTile label="Active this week" value={activeThisWeek} sub={`of ${total}`} />
          <StatusTile label="At risk"          value={atRiskCount} accent={atRiskCount > 0} />
          <StatusTile label="Pacts won today"  value={pactsWonToday} />
        </section>

        {total === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Readiness chart */}
            <section className="bg-white rounded-lg shadow-card border border-border p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display font-bold text-blue text-base">
                  Readiness by athlete
                </h3>
                <span className="text-[10px] text-muted tracking-wider uppercase">
                  Tap card to open profile
                </span>
              </div>
              <ReadinessChart athletes={athletes} />
            </section>

            {/* Athletes grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-bold text-blue text-base">
                    Athletes
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {total} athletes · {atRiskCount} need attention · {onTrackCount} on track
                  </p>
                </div>
                <FilterTabs total={total} atRisk={atRiskCount} onTrack={onTrackCount} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {athletes.map(a => <AthleteCard key={a.id} athlete={a} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

// ============================================================
// Components
// ============================================================
function StatusTile({ label, value, sub, accent }) {
  return (
    <div className={`bg-white rounded-lg shadow-card p-5 border ${accent ? 'border-red' : 'border-border'}`}>
      <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div className={`font-display font-extrabold text-3xl leading-none ${accent ? 'text-red' : 'text-blue'}`}>
          {value}
        </div>
        {sub && (
          <div className="text-xs text-muted">{sub}</div>
        )}
      </div>
    </div>
  );
}

function ReadinessChart({ athletes }) {
  return (
    <div className="flex items-end gap-3 h-32">
      {athletes.map(a => {
        const heightPct = Math.max(8, a.readiness); // floor so labels stay legible
        const isLow = a.readiness < 60;
        return (
          <Link
            key={a.id}
            href={`/dashboard/clients/${a.id}`}
            className="flex-1 flex flex-col items-center gap-2 min-w-0 group cursor-pointer"
            title={`${a.name}: readiness ${a.readiness}`}
          >
            <div className="w-full flex items-end h-full">
              <div
                className={`w-full rounded-t transition-all group-hover:opacity-80 ${
                  isLow ? 'bg-warn' : 'bg-blue'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <div className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${
              isLow ? 'border-warn text-warn-dark' : 'border-blue text-blue'
            }`}>
              {initials(a.name)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FilterTabs({ total, atRisk, onTrack }) {
  // Visual-only filters for now — wiring these to client state can come later
  return (
    <div className="hidden md:flex gap-1 items-center">
      <button className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded border border-blue text-blue bg-white">
        All ({total})
      </button>
      <button className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded border border-border text-muted hover:text-blue hover:border-blue transition-colors bg-white">
        Needs attention ({atRisk})
      </button>
      <button className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded border border-border text-muted hover:text-blue hover:border-blue transition-colors bg-white">
        On track ({onTrack})
      </button>
    </div>
  );
}

function AthleteCard({ athlete: a }) {
  const isAtRisk = a.isAtRisk;
  const accentClass = isAtRisk ? 'border-t-warn' : 'border-t-blue';
  const initialsClass = isAtRisk ? 'bg-warn-light text-warn-dark' : 'bg-bg-alt text-blue';

  return (
    <Link
      href={`/dashboard/clients/${a.id}`}
      className={`block bg-white rounded-lg shadow-card border border-border border-t-4 ${accentClass} hover:shadow-card-hover transition-all`}
    >
      <div className="p-5 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded grid place-items-center font-display font-bold text-sm flex-shrink-0 ${initialsClass}`}>
              {initials(a.name)}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-blue text-sm truncate">
                {a.name}
              </div>
              <div className="text-[11px] text-muted truncate">
                {(a.goal || 'no goal').replace(/_/g, ' ')}{a.gym ? ` · ${a.gym}` : ''}
              </div>
            </div>
          </div>
          <ReadinessCircle score={a.readiness} isLow={a.readiness < 60} />
        </div>

        {/* Top metrics — steps, protein, mood */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="STEPS"   value={fmtNum(a.steps)} />
          <MetricTile label="PROTEIN" value={a.protein ? `${Math.round(a.protein)}g` : '—'} />
          <MetricTile label="MOOD"    value={a.mood != null ? a.mood.toFixed(1) : '—'} />
        </div>

        {/* Adherence tiles — sessions, nutrition */}
        <div className="grid grid-cols-2 gap-2">
          <PercentTile label="SESSIONS"  value={a.sessionPct} />
          <PercentTile label="NUTRITION" value={a.nutritionPct} />
        </div>

        {/* Trend + risk badges */}
        <div className="flex gap-2">
          <TrendBadge trend={a.trend} />
          <RiskBadge  risk={a.risk} />
        </div>

        {/* Weight progress */}
        <ProgressBar
          lost={a.lost}
          toGo={a.toGo}
          start={a.start_weight}
          target={a.target_weight}
        />
      </div>
    </Link>
  );
}

function ReadinessCircle({ score, isLow }) {
  const colorClass = isLow ? 'border-warn text-warn-dark' : 'border-blue text-blue';
  return (
    <div className={`w-11 h-11 rounded-full border-2 ${colorClass} grid place-items-center font-display font-bold text-sm flex-shrink-0 tabular-nums`}>
      {score}
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="bg-bg rounded px-2 py-2 text-center">
      <div className="font-display font-bold text-blue text-sm leading-none tabular-nums">{value}</div>
      <div className="text-[9px] font-semibold text-muted tracking-[0.12em] mt-1.5">{label}</div>
    </div>
  );
}

function PercentTile({ label, value }) {
  const tone =
    value >= 75 ? { tx: 'text-green-700', ic: '✓', icCol: 'text-green-600' }
    : value >= 33 ? { tx: 'text-warn-dark', ic: '~', icCol: 'text-warn-dark' }
    : { tx: 'text-red', ic: '✗', icCol: 'text-red' };

  return (
    <div className="bg-bg rounded px-3 py-2 flex items-center justify-between">
      <div>
        <div className={`font-display font-bold text-sm leading-none tabular-nums ${tone.tx}`}>
          {value}%
        </div>
        <div className="text-[9px] font-semibold text-muted tracking-[0.12em] mt-1.5">{label}</div>
      </div>
      <div className={`text-base font-bold ${tone.icCol}`}>{tone.ic}</div>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    declining: { arrow: '↓', label: 'Declining', cls: 'bg-red/10 text-red border-red/30' },
    building:  { arrow: '↑', label: 'Building',  cls: 'bg-green-50 text-green-700 border-green-200' },
    steady:    { arrow: '→', label: 'Steady',    cls: 'bg-bg text-muted border-border' },
  };
  const m = map[trend] || map.steady;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border inline-flex items-center gap-1 ${m.cls}`}>
      <span>{m.arrow}</span> {m.label}
    </span>
  );
}

function RiskBadge({ risk }) {
  const map = {
    high:   { icon: '⚠', label: 'High risk', cls: 'bg-red/10 text-red border-red/30' },
    medium: { icon: '○', label: 'Watch',     cls: 'bg-warn-light text-warn-dark border-warn/30' },
    low:    { icon: '✓', label: 'Low risk',  cls: 'bg-green-50 text-green-700 border-green-200' },
  };
  const m = map[risk] || map.low;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border inline-flex items-center gap-1 ${m.cls}`}>
      <span>{m.icon}</span> {m.label}
    </span>
  );
}

function ProgressBar({ lost, toGo, start, target }) {
  if (lost == null || start == null || target == null) {
    return <div className="text-[11px] text-muted pt-1">No weight goal set</div>;
  }

  const totalRange = start - target;
  const pct = totalRange !== 0
    ? Math.max(0, Math.min(100, (lost / totalRange) * 100))
    : 0;

  const lostLabel = lost > 0 ? `${lost.toFixed(1)}kg lost`
                  : lost < 0 ? `${Math.abs(lost).toFixed(1)}kg gained`
                  : 'No change';

  const toGoLabel = toGo > 0 ? `${toGo.toFixed(1)}kg to go`
                  : toGo < 0 ? `Past target by ${Math.abs(toGo).toFixed(1)}kg`
                  : 'At target';

  const barColor = pct < 30 ? 'bg-warn' : 'bg-blue';

  return (
    <div className="pt-1">
      <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted tabular-nums">
        <span>{lostLabel}</span>
        <span>{toGoLabel}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-12 text-center">
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-red mb-3">
        No clients yet
      </p>
      <h3 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-3">
        Empty roster
      </h3>
      <p className="text-body text-sm leading-relaxed max-w-md mx-auto">
        Either no clients are linked to your account yet, or they haven&apos;t been onboarded.
        Run the backfill SQL from Migration 003 to link your existing client row.
      </p>
    </div>
  );
}
