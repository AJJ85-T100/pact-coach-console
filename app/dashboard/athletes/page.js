import Link from 'next/link';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================================
// Helpers
// ============================================================
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
  return d.toLocaleDateString('en-CA');
}

// Build an array of the last N days as ISO date strings (oldest first)
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateStrISO(d));
  }
  return out;
}

// ============================================================
// RAG classification
// ============================================================

// Steps target — could be per-client later, hardcoded default for now
const STEPS_TARGET    = 8000;
const PROTEIN_TARGET  = 120; // grams

function classifySteps(steps) {
  if (steps == null || steps === 0) return 'red';
  if (steps >= STEPS_TARGET)         return 'green';
  if (steps >= STEPS_TARGET * 0.7)   return 'amber';
  return 'red';
}

function classifyNutrition(record) {
  if (!record || !record.calories || record.calories === 0) return 'red';
  if (record.protein && record.protein >= PROTEIN_TARGET)    return 'green';
  if (record.calories > 0)                                    return 'amber';
  return 'red';
}

function classifyPact(status) {
  if (status === 'won')     return 'green';
  if (status === 'partial') return 'amber';
  if (status === 'lost')    return 'red';
  return 'empty'; // no entry for that day
}

// ============================================================
// Per-athlete data fetch
// ============================================================
async function fetchAthleteData(service, client) {
  const days = lastNDays(7);
  const fourteenAgo = new Date(); fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const sevenAgo    = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);

  const [healthR, pactsR, convosR, slipsR, weighR] = await Promise.all([
    service.from('health_data')
      .select('steps, calories, protein, created_at')
      .eq('client_id', client.id)
      .gte('created_at', sevenAgo.toISOString())
      .order('created_at', { ascending: false }),
    service.from('daily_pacts')
      .select('date, status')
      .eq('client_id', client.id)
      .gte('date', dateStrISO(fourteenAgo)),
    service.from('conversations')
      .select('created_at, role')
      .eq('client_id', client.id)
      .eq('role', 'user')
      .gte('created_at', sevenAgo.toISOString()),
    service.from('slip_events')
      .select('id')
      .eq('client_id', client.id)
      .gte('detected_at', sevenAgo.toISOString()),
    service.from('weigh_ins')
      .select('weight')
      .eq('client_id', client.id)
      .not('weight', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Index health_data by date (extracted from created_at)
  // Since we ordered desc, the FIRST row for each date is the most recent —
  // skip subsequent rows for the same date so we keep the latest snapshot.
  const healthByDate = {};
  (healthR.data || []).forEach(h => {
    const dateKey = h.created_at.split('T')[0];
    if (!healthByDate[dateKey]) healthByDate[dateKey] = h;
  });

  // Index daily_pacts by date
  const pactByDate = {};
  (pactsR.data || []).forEach(p => { pactByDate[p.date] = p.status; });

  // Build the three 7-day strips
  const stepDays     = days.map(d => classifySteps(healthByDate[d]?.steps));
  const nutritionDays = days.map(d => classifyNutrition(healthByDate[d]));
  const pactDays     = days.map(d => classifyPact(pactByDate[d]));

  // Engagement score: % of last 7 days with at least one user message
  const uniqueConvoDays = new Set(
    (convosR.data || []).map(c => c.created_at.split('T')[0])
  );
  const engagement = Math.round((uniqueConvoDays.size / 7) * 100);

  // Trend: this week's won-pacts vs last week's
  const pacts14 = pactsR.data || [];
  const thisWeekWon = pacts14.filter(p => p.date >= days[0] && p.status === 'won').length;
  const lastWeekWon = pacts14.filter(p => p.date < days[0] && p.status === 'won').length;

  let trend = 'steady';
  if (thisWeekWon > lastWeekWon + 1)      trend = 'building';
  else if (thisWeekWon < lastWeekWon - 1) trend = 'declining';

  // Risk
  const slipsThisWeek = slipsR.data?.length || 0;
  const risk = (client.status === 'at_risk' || slipsThisWeek >= 3) ? 'high'
             : slipsThisWeek > 0 ? 'medium' : 'low';

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
    stepDays,
    nutritionDays,
    pactDays,
    engagement,
    trend,
    risk,
    isAtRisk: risk === 'high',
    isWatch:  risk === 'medium',
    currentWeight,
    lost,
    toGo,
    activeThisWeek: uniqueConvoDays.size > 0 || pacts14.some(p => p.date >= days[0]),
  };
}

// ============================================================
// Page
// ============================================================
export default async function AthletesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const service = createServiceClient();

  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const { data: clients = [] } = await service
    .from('clients')
    .select('*')
    .eq('pt_id', pt?.id || null)
    .order('name');

  const athletes = await Promise.all(
    (clients || []).map(c => fetchAthleteData(service, c))
  );

  const total       = athletes.length;
  const atRiskCount = athletes.filter(a => a.isAtRisk).length;
  const watchCount  = athletes.filter(a => a.isWatch).length;
  const onTrackCount = athletes.filter(a => a.risk === 'low').length;

  return (
    <div className="px-8 lg:px-10 py-8 lg:py-10">

      {/* Header */}
      <header className="flex items-center justify-between gap-6 mb-6">
        <div>
          <h1 className="font-display font-extrabold text-blue text-3xl lg:text-4xl uppercase tracking-tight leading-none">
            Clients
          </h1>
          <p className="text-sm text-muted mt-2">
            {total} active · {atRiskCount} at-risk · {watchCount} watch
          </p>
        </div>

        {/* Search — visual placeholder */}
        <div className="hidden md:block flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name, program, status..."
            className="w-full bg-white border border-border rounded px-4 py-2.5 text-sm placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
            disabled
          />
        </div>
      </header>

      {/* Filter tabs — visual only for now */}
      <FilterTabs total={total} atRisk={atRiskCount} watch={watchCount} onTrack={onTrackCount} />

      {/* Athletes grid */}
      {total === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
          {athletes.map(a => <AthleteCard key={a.id} athlete={a} />)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Components
// ============================================================
function FilterTabs({ total, atRisk, watch, onTrack }) {
  return (
    <div className="flex gap-2 flex-wrap mt-5">
      <Tab label="All"     count={total}    active />
      <Tab label="On track" count={onTrack} />
      <Tab label="Watch"   count={watch} />
      <Tab label="At risk" count={atRisk}  warn={atRisk > 0} />
    </div>
  );
}

function Tab({ label, count, active, warn }) {
  return (
    <button
      className={`px-3.5 py-2 rounded text-[11px] font-bold tracking-wider uppercase border transition-colors ${
        active
          ? 'bg-blue text-white border-blue'
          : warn
            ? 'bg-white text-red border-red/30 hover:border-red'
            : 'bg-white text-muted border-border hover:text-blue hover:border-blue'
      }`}
    >
      {label} <span className={`ml-1 ${active ? 'text-white/70' : 'text-muted'}`}>{count}</span>
    </button>
  );
}

function AthleteCard({ athlete: a }) {
  const accentClass = a.isAtRisk ? 'border-t-warn' : 'border-t-blue';
  const initialsBg  = a.isAtRisk ? 'bg-warn-light text-warn-dark' : 'bg-bg-alt text-blue';

  return (
    <Link
      href={`/dashboard/clients/${a.id}`}
      className={`block bg-white rounded-lg shadow-card border border-border border-t-4 ${accentClass} hover:shadow-card-hover transition-all`}
    >
      <div className="p-5 space-y-4">

        {/* Header: avatar + name + goal + engagement score */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded grid place-items-center font-display font-bold text-sm flex-shrink-0 ${initialsBg}`}>
              {initials(a.name)}
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-blue text-sm truncate">
                {a.name}
              </div>
              <div className="text-[11px] text-muted truncate">
                {(a.goal || 'no goal').replace(/_/g, ' ')}
              </div>
            </div>
          </div>
          <EngagementScore score={a.engagement} />
        </div>

        {/* 7-day RAG strips */}
        <div className="space-y-2">
          <RAGStrip label="STEPS"     days={a.stepDays} />
          <RAGStrip label="NUTRITION" days={a.nutritionDays} />
          <RAGStrip label="PACTS"     days={a.pactDays} />
        </div>

        {/* Trend + risk */}
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

function EngagementScore({ score }) {
  const isLow = score < 50;
  const ringColor = isLow ? 'border-warn text-warn-dark' : 'border-blue text-blue';
  return (
    <div className="flex flex-col items-end flex-shrink-0">
      <div className={`w-11 h-11 rounded-full border-2 ${ringColor} grid place-items-center font-display font-bold text-sm tabular-nums`}>
        {score}
      </div>
      <div className="text-[8px] font-bold text-muted tracking-widest uppercase mt-1">
        Engagement
      </div>
    </div>
  );
}

function RAGStrip({ label, days }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[9px] font-bold text-muted tracking-[0.12em] uppercase w-[68px] flex-shrink-0">
        {label}
      </div>
      <div className="flex-1 grid grid-cols-7 gap-1">
        {days.map((status, i) => (
          <div
            key={i}
            className={`h-2.5 rounded-sm transition-opacity ${
              status === 'green' ? 'bg-emerald-500' :
              status === 'amber' ? 'bg-warn'        :
              status === 'red'   ? 'bg-red'         :
                                   'bg-bg-alt'
            }`}
            title={`Day ${i - 6}: ${status}`}
          />
        ))}
      </div>
    </div>
  );
}

function TrendBadge({ trend }) {
  const map = {
    declining: { arrow: '↓', label: 'Declining', cls: 'bg-red/10 text-red border-red/30' },
    building:  { arrow: '↑', label: 'Building',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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
    low:    { icon: '✓', label: 'On track',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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
    <div className="bg-white rounded-lg shadow-card border border-border p-12 text-center mt-6">
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-red mb-3">
        No clients yet
      </p>
      <h3 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-3">
        Empty roster
      </h3>
      <p className="text-body text-sm leading-relaxed max-w-md mx-auto">
        Invite your first client to get started, or run the backfill SQL to link existing rows.
      </p>
    </div>
  );
}
