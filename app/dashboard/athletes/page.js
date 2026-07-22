import { createClient, createServiceClient } from '@/lib/supabase/server';
import { riskScore, riskTier } from '@/lib/risk';
import RosterExplorer from '@/components/RosterExplorer';

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
// RAG classification — judged against the COACH-SET per-athlete targets
// (clients.step_target / protein_target, the same numbers PAX coaches to),
// falling back to sensible defaults when none are set.
// ============================================================

const STEPS_TARGET_DEFAULT   = 8000;
const PROTEIN_TARGET_DEFAULT = 120; // grams

function classifySteps(steps, target) {
  const goal = target > 0 ? target : STEPS_TARGET_DEFAULT;
  if (steps == null || steps === 0) return 'red';
  if (steps >= goal)                return 'green';
  if (steps >= goal * 0.7)          return 'amber';
  return 'red';
}

function classifyNutrition(record, proteinTarget) {
  const goal = proteinTarget > 0 ? proteinTarget : PROTEIN_TARGET_DEFAULT;
  if (!record || !record.calories || record.calories === 0) return 'red';
  if (record.protein && record.protein >= goal)             return 'green';
  if (record.calories > 0)                                  return 'amber';
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

  const [healthR, pactsR, convosR, slipsR, weighR, progsR] = await Promise.all([
    service.from('health_data')
      .select('steps, calories, protein, created_at')
      .eq('client_id', client.id)
      .gte('created_at', sevenAgo.toISOString())
      .order('created_at', { ascending: false }),
    service.from('daily_pacts')
      .select('date, status, wins_completed, total_wins')
      .eq('client_id', client.id)
      .gte('date', dateStrISO(fourteenAgo)),
    // 90-day lookback so days-silent matches the shared risk formula
    // (engagement still only counts the last 7 days below).
    service.from('conversations')
      .select('created_at, role')
      .eq('client_id', client.id)
      .eq('role', 'user')
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .order('created_at', { ascending: false }),
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
    // NEW: non-archived training programmes for this client
    service.from('programs')
      .select('id, name, status, weeks')
      .eq('client_id', client.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),
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

  // Build the three 7-day strips — against this athlete's own targets
  const stepDays     = days.map(d => classifySteps(healthByDate[d]?.steps, client.step_target));
  const nutritionDays = days.map(d => classifyNutrition(healthByDate[d], client.protein_target));
  const pactDays     = days.map(d => classifyPact(pactByDate[d]));

  // Engagement score: % of last 7 days with at least one user message
  const sevenAgoISO = sevenAgo.toISOString();
  const uniqueConvoDays = new Set(
    (convosR.data || [])
      .filter(c => c.created_at >= sevenAgoISO)
      .map(c => c.created_at.split('T')[0])
  );
  const engagement = Math.round((uniqueConvoDays.size / 7) * 100);

  // Trend: this week's won-pacts vs last week's
  const pacts14 = pactsR.data || [];
  const thisWeekWon = pacts14.filter(p => p.date >= days[0] && p.status === 'won').length;
  const lastWeekWon = pacts14.filter(p => p.date < days[0] && p.status === 'won').length;

  let trend = 'steady';
  if (thisWeekWon > lastWeekWon + 1)      trend = 'building';
  else if (thisWeekWon < lastWeekWon - 1) trend = 'declining';

  // Risk — the ONE shared definition (lib/risk.js), identical inputs to the
  // at-risk board and PAX reports: silence + 7-day pact adherence. A PAX
  // at_risk flag on the client row still forces the top tier.
  const slipsThisWeek = slipsR.data?.length || 0;
  const week7 = days[0];
  const week7Rows = pactsR.data?.filter(p => p.date >= week7) || [];
  const winsSum  = week7Rows.reduce((s, r) => s + (r.wins_completed || 0), 0);
  const totalSum = week7Rows.reduce((s, r) => s + (r.total_wins || 0), 0);
  const adherencePct = totalSum > 0 ? Math.round((winsSum / totalSum) * 100) : null;
  const lastMsg = convosR.data?.[0]?.created_at || null;
  const daysSilent = lastMsg ? Math.floor((Date.now() - new Date(lastMsg).getTime()) / 86400000) : null;
  const score = riskScore({ daysSilent, adherencePct, daysLogged: week7Rows.length });
  const risk = client.status === 'at_risk' ? 'high' : riskTier(score);

  // Weight progress
  const currentWeight = weighR.data?.[0]?.weight ?? client.current_weight;
  const lost = (client.start_weight != null && currentWeight != null)
    ? +(client.start_weight - currentWeight).toFixed(1)
    : null;
  const toGo = (currentWeight != null && client.target_weight != null)
    ? +(currentWeight - client.target_weight).toFixed(1)
    : null;

  // Current programme: prefer active over draft
  const programmes = progsR.data || [];
  const currentProgramme = programmes.find(p => p.status === 'active')
                         || programmes.find(p => p.status === 'draft')
                         || null;

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
    currentProgramme,
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
      <header className="mb-6">
        <h1 className="font-display font-extrabold text-blue text-3xl lg:text-4xl uppercase tracking-tight leading-none">
          Athletes
        </h1>
        <p className="text-sm text-muted mt-2">
          {total} active · {atRiskCount} at-risk · {watchCount} watch · {onTrackCount} on track
        </p>
      </header>

      {/* Interactive search + filters + grid (client component) */}
      {total === 0 ? (
        <EmptyState />
      ) : (
        <RosterExplorer athletes={athletes} />
      )}
    </div>
  );
}

// ============================================================
// Components
// ============================================================
function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-12 text-center mt-6">
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-red mb-3">
        No athletes yet
      </p>
      <h3 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-3">
        Empty roster
      </h3>
      <p className="text-body text-sm leading-relaxed max-w-md mx-auto">
        Invite your first athlete to get started — the Invite athlete page builds their onboarding link.
      </p>
    </div>
  );
}
