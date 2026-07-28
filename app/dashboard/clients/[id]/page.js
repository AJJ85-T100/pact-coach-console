import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import PactsPanel from '@/components/PactsPanel';
import DangerZone from '@/components/DangerZone';
import NudgeTool from '@/components/NudgeTool';
import AthleteQuickActions from '@/components/AthleteQuickActions';
import JourneyChart from '@/components/athlete/JourneyChart';
import TodayMeters from '@/components/athlete/TodayMeters';
import ConsistencyHeatmap from '@/components/athlete/ConsistencyHeatmap';
import TrendRows from '@/components/athlete/TrendRows';
import StrengthSmalls from '@/components/athlete/StrengthSmalls';
import { deriveJourney, dayKey, addDays } from '@/lib/athlete/metrics';

// ============================================================
// Helpers
// ============================================================
function timeAgo(iso) {
  if (!iso) return 'never';
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

function dateLabel(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  if (!name) return '??';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ============================================================
// Page
// ============================================================
export default async function ClientDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const service = createServiceClient();

  // PT scope check
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const { data: client } = await service
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .eq('pt_id', pt?.id || null)
    .maybeSingle();

  if (!client) notFound();

  // Date windows
  const today        = new Date();
  const sevenAgo     = new Date(today);     sevenAgo.setDate(today.getDate() - 7);
  const fourteenAgo  = new Date(today);     fourteenAgo.setDate(today.getDate() - 14);
  const twentyEightAgo = new Date(today);   twentyEightAgo.setDate(today.getDate() - 28);
  const eightWeeksAgo  = new Date(today);   eightWeeksAgo.setDate(today.getDate() - 56);
  // The visual card needs deeper windows than the old text card did:
  // 90 days feeds the 28-day sparklines and the 8-week consistency grid.
  const ninetyAgo      = new Date(today);   ninetyAgo.setDate(today.getDate() - 90);

  const fourteenAgoStr = fourteenAgo.toLocaleDateString('en-CA');
  const eightWeeksAgoStr  = eightWeeksAgo.toLocaleDateString('en-CA');
  const ninetyAgoStr      = ninetyAgo.toLocaleDateString('en-CA');

  // Start of this week (Monday) for weekly/weekend pact lookup
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const mondayStr = monday.toLocaleDateString('en-CA');

  // ============================================================
  // Parallel data fetch — 14 queries, all scoped by client.id
  // ============================================================
  const [
    msgsR, slipsR, pactsR, healthR, weighR, liftsR,
    customPactsR, weeklyPactR, weekendPactR,
    stakesR, cosignersR, winStackR, moodR,
    progsR, terraR, workoutsR,
  ] = await Promise.all([
    // Conversation history (last 30)
    service.from('conversations')
      .select('role, content, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(30),

    // Slips in last 14 days
    service.from('slip_events')
      .select('event_type, detected_at, date_for, context')
      .eq('client_id', client.id)
      .gte('detected_at', fourteenAgo.toISOString())
      .order('detected_at', { ascending: false }),

    // Daily pacts last 56 days (8-week consistency grid)
    service.from('daily_pacts')
      .select('date, status, wins_completed, total_wins')
      .eq('client_id', client.id)
      .gte('date', eightWeeksAgoStr)
      .order('date', { ascending: false }),

    // Health data last 90 days (today + sparklines + consistency + averages)
    service.from('health_data')
      .select('steps, calories, protein, carbs, fat, raw, created_at')
      .eq('client_id', client.id)
      .gte('created_at', ninetyAgo.toISOString())
      .order('created_at', { ascending: false }),

    // FULL weigh-in history, ASCENDING — the journey chart needs the series,
    // and the plausibility guard needs each reading's predecessor to judge it.
    // (Previously .limit(1) desc, which is how a single bad row became
    // "Current 15kg · Lost 91.3kg · Past target by 70kg".)
    service.from('weigh_ins')
      .select('weight, date, created_at')
      .eq('client_id', client.id)
      .not('weight', 'is', null)
      .order('date', { ascending: true })
      .limit(1000),

    // Lift history — last 8 weeks for trend calc
    service.from('lift_history')
      .select('squat, bench_press, deadlift, ohp, recorded_date')
      .eq('client_id', client.id)
      .gte('recorded_date', eightWeeksAgoStr)
      .order('recorded_date', { ascending: false }),

    // Active custom pacts
    service.from('custom_pacts')
      .select('name, rule, cadence, current_streak, longest_streak, status')
      .eq('client_id', client.id)
      .eq('status', 'active')
      .order('current_streak', { ascending: false }),

    // This week's weekly pact
    service.from('weekly_pacts')
      .select('pact_name, commitments, pact_score, status, week_start')
      .eq('client_id', client.id)
      .eq('week_start', mondayStr)
      .maybeSingle(),

    // Most recent weekend pact
    service.from('weekend_pacts')
      .select('saturday_plan, sunday_plan, monday_target_kg, monday_actual_kg, outcome, social_events, weekend_start')
      .eq('client_id', client.id)
      .order('weekend_start', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Active stakes
    service.from('stakes')
      .select('amount, stake_type, charity_name, trigger_threshold, breaks_so_far, status')
      .eq('client_id', client.id)
      .eq('status', 'active'),

    // Cosigners
    service.from('cosigners')
      .select('name, relationship, notify_on_break')
      .eq('client_id', client.id),

    // Win stack last 14 days
    service.from('win_stack')
      .select('date, pact_type, description, weight, created_at')
      .eq('client_id', client.id)
      .gte('date', fourteenAgoStr)
      .order('date', { ascending: false }),

    // Mood — 90 days, so it can carry a sparkline instead of a lone number
    service.from('mood_ratings')
      .select('rating, date, created_at')
      .eq('client_id', client.id)
      .gte('date', ninetyAgoStr)
      .order('created_at', { ascending: false }),

    // Training programmes — non-archived, newest first
    service.from('programs')
      .select('id, name, status, weeks, start_date, updated_at')
      .eq('client_id', client.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),

    // Connected wearables (Terra) — devices + when data last landed
    service.from('terra_connections')
      .select('provider, status, connected_at, last_event_at, last_event_type, revoked_at')
      .eq('client_id', client.id)
      .order('connected_at', { ascending: true }),

    // Completed workouts, 90 days — the Training row of the consistency grid
    // and the Session tile. Nothing on the old card showed whether the athlete
    // actually trained.
    service.from('workout_logs')
      .select('id, date, session_name')
      .eq('client_id', client.id)
      .gte('date', ninetyAgoStr)
      .order('date', { ascending: false }),
  ]);

  // ============================================================
  // Derive
  // ============================================================
  const messages   = msgsR.data    || [];
  const slips      = slipsR.data   || [];
  const pacts      = pactsR.data   || [];
  const healthAll  = healthR.data  || [];
  const weighAll   = weighR.data   || [];   // ascending
  const workouts   = workoutsR.data || [];
  const lifts      = liftsR.data   || [];
  const customPacts = customPactsR.data || [];
  const weeklyPact  = weeklyPactR.data  || null;
  const weekendPact = weekendPactR.data || null;
  const stakes      = stakesR.data  || [];
  const cosigners   = cosignersR.data || [];
  const wins        = winStackR.data || [];
  const moods       = moodR.data || [];
  const programmes  = progsR.data || [];
  const devices     = terraR.data || [];   // gracefully [] until the migration runs

  // ------------------------------------------------------------
  // Journey — current weight is the END OF THE 7-DAY TREND over readings
  // that pass a plausibility guard, never the latest raw row. See
  // lib/athlete/metrics.js and claude/PACT_Athlete_Card_Visual_Spec.md §4.
  // ------------------------------------------------------------
  const journeyData = deriveJourney(weighAll, client);
  const currentWeight = journeyData.current;
  const { lost, toGo } = journeyData;

  const journey = {
    points:  journeyData.trend.map(t => ({ t: t.when.getTime(), v: t.v, key: t.key })),
    raw:     journeyData.all.map(w => ({ t: w.when.getTime(), w: w.weight, key: w.key, suspect: w.suspect })),
    flagged: journeyData.flagged.map(w => ({ t: w.when.getTime(), w: w.weight })),
    start: journeyData.start,
    target: journeyData.target,
    current: currentWeight,
    lost, toGo,
    pace: journeyData.paceKgPerWeek,
    etaWeeks: journeyData.etaWeeks,
    cleanCount: journeyData.clean.length,
    lastCleanLabel: journeyData.lastCleanAt
      ? journeyData.lastCleanAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : null,
  };

  // ------------------------------------------------------------
  // One dense day-by-day series (oldest → newest) behind Today,
  // Consistency and Trends, so no two sections can disagree.
  // ------------------------------------------------------------
  const healthByDay  = {};
  healthAll.forEach(h => { const k = h.created_at?.split('T')[0]; if (k && !healthByDay[k]) healthByDay[k] = h; });
  const moodByDay    = {};
  moods.forEach(m => { const k = m.date || m.created_at?.split('T')[0]; if (k && !moodByDay[k]) moodByDay[k] = m; });
  const pactByDay    = {};
  pacts.forEach(p => { if (p.date && !pactByDay[p.date]) pactByDay[p.date] = p; });
  const workoutByDay = {};
  workouts.forEach(w => { if (w.date && !workoutByDay[w.date]) workoutByDay[w.date] = w; });

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Programmed days: the athlete's stated training days. (The active programme's
  // workout_days is the better source once it's exposed on this query — same shape.)
  const trainingDays = Array.isArray(client.training_days) ? client.training_days : [];

  const series = [];
  for (let i = 89; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dayKey(d);
    const h = healthByDay[k] || null;
    const p = pactByDay[k] || null;
    const w = workoutByDay[k] || null;
    series.push({
      date: k,
      dow: d.getDay(),
      trainDay: trainingDays.length ? trainingDays.includes(DOW[d.getDay()]) : false,
      trained: !!w,
      sessionName: w?.session_name || null,
      steps:    h?.steps ?? null,
      calories: h?.calories ?? null,
      protein:  h?.protein ?? null,
      carbs:    h?.carbs ?? null,
      fat:      h?.fat ?? null,
      sleep:    h?.raw?.sleep ?? null,
      mood:     moodByDay[k]?.rating ?? null,
      pact:     p ? (p.status === 'kept' || p.status === 'complete' || p.wins_completed >= (p.total_wins ?? 1)) : null,
      pactWins: p?.wins_completed ?? null,
      pactTotal: p?.total_wins ?? null,
    });
  }

  const targets = {
    steps:    client.step_target    ?? null,
    calories: client.calorie_target ?? null,
    protein:  client.protein_target ?? null,
    carbs:    client.carb_target    ?? null,
    fat:      client.fat_target     ?? null,
    sleep:    7.5,   // no per-client column yet; the one honest global default
  };

  const todayRow = series[series.length - 1];
  const last28   = series.slice(-28);
  const plannedIn28 = last28.filter(d => d.trainDay).length;
  const doneIn28    = last28.filter(d => d.trainDay && d.trained).length;
  const nextTrainDow = trainingDays.length
    ? (DOW.slice(todayRow.dow + 1).concat(DOW.slice(0, todayRow.dow + 1)).find(x => trainingDays.includes(x)) || null)
    : null;
  const sessionState = !todayRow.trainDay ? 'rest' : (todayRow.trained ? 'good' : 'crit');
  const session = {
    state: sessionState,
    next: todayRow.trainDay && !todayRow.trained ? 'today' : nextTrainDow,
    done: doneIn28,
    planned: plannedIn28,
  };

  // Why a metric is thin, when we can say — the card explains the hole
  // rather than drawing a fall that didn't happen.
  const staleDevice = (devicesList) => devicesList.find(d => d.status === 'error' || d.status === 'revoked');
  const sourceNotes = {};
  {
    const bad = staleDevice(terraR.data || []);
    if (bad) {
      const nm = bad.provider ? bad.provider.charAt(0) + bad.provider.slice(1).toLowerCase() : 'a device';
      sourceNotes.sleep = `${nm} ${bad.status === 'revoked' ? 'disconnected' : 'needs reconnecting'}`;
      sourceNotes.steps = sourceNotes.sleep;
    }
  }

  // Strength — one small multiple per lift, oldest → newest.
  // Source today is lift_history; Backlog 4.4 swaps it for set_logs + Epley
  // e1RM without changing this shape.
  const liftsAsc = [...lifts].reverse();
  const LIFT_DEFS = [
    { key: 'squat',       label: 'Squat' },
    { key: 'bench_press', label: 'Bench' },
    { key: 'deadlift',    label: 'Deadlift' },
    { key: 'ohp',         label: 'OHP' },
  ];
  const liftSeries = LIFT_DEFS.map(L => ({
    key: L.key,
    label: L.label,
    points: liftsAsc
      .filter(r => r[L.key] != null)
      .map(r => ({ t: new Date(r.recorded_date).getTime(), v: Number(r[L.key]) })),
  }));

  const firstName = client.name?.split(' ')[0] || client.name;

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="px-8 lg:px-10 py-8">

      {/* Back link */}
      <Link
        href="/dashboard/athletes"
        className="text-xs font-semibold tracking-wider uppercase text-muted hover:text-red transition-colors inline-block mb-6"
      >
        ‹ Back to athletes
      </Link>

      {/* Athlete header band — dark navy */}
      <header className="bg-blue text-white rounded-lg px-7 py-6 mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 bg-red text-white grid place-items-center font-display font-black text-xl rounded flex-shrink-0">
              {initials(client.name)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-extrabold text-3xl lg:text-4xl uppercase tracking-tight leading-none mb-1.5">
                {client.name}
              </h1>
              <div className="text-sm text-white/70 flex items-center gap-3 flex-wrap">
                <span>{client.goal?.replace(/_/g, ' ') || 'No goal set'}</span>
                <span className="text-white/30">·</span>
                <span className="capitalize">{client.status || 'active'}</span>
                {client.gym && (<>
                  <span className="text-white/30">·</span>
                  <span>{client.gym}</span>
                </>)}
              </div>
            </div>
          </div>

          {/* Top-right meta dates */}
          <div className="grid grid-cols-3 gap-6 text-right">
            <MetaDate label="Member since" date={client.created_at} />
            <MetaDate label="Target date"  date={client.target_date} />
            <MetaDate label="Event"        date={client.event_date} sublabel={client.event_name} />
          </div>
        </div>
      </header>

      {/* Quick actions strip — sits right under the navy band */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Link
          href={`/dashboard/clients/${client.id}/programs`}
          className="inline-flex items-center gap-2 bg-red text-white px-4 py-2 rounded text-[11px] font-bold tracking-[0.12em] uppercase hover:bg-red/90 transition-colors shadow-card"
        >
          <span className="text-base leading-none">+</span>
          {programmes.length === 0 ? 'Build first programme' : 'New programme'}
        </Link>
        {programmes.length > 0 && (
          <Link
            href={`/dashboard/clients/${client.id}/programs`}
            className="inline-flex items-center gap-2 bg-white border border-border text-blue px-4 py-2 rounded text-[11px] font-bold tracking-[0.12em] uppercase hover:border-blue transition-colors"
          >
            View all programmes · {programmes.length}
          </Link>
        )}
        <AthleteQuickActions
          clientId={client.id}
          targets={{
            calories: client.calorie_target,
            protein:  client.protein_target,
            carbs:    client.carb_target,
            fat:      client.fat_target,
            steps:    client.step_target,
          }}
        />
      </div>

      {/* ============================================================
          Journey — full width, above the grid. The one chart that answers
          "is what I'm prescribing working?", which no figure on the old
          text card could.
          ============================================================ */}
      <div className="mb-5">
        <div className="bg-white rounded-lg shadow-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">Journey</h3>
            <span className="text-[11.5px] text-muted">
              {journey.cleanCount > 0
                ? `${journey.cleanCount} weigh-in${journey.cleanCount === 1 ? '' : 's'}${
                    journey.lastCleanLabel ? ` · last ${journey.lastCleanLabel}` : ''}`
                : 'no weigh-ins yet'}
            </span>
          </div>
          <div className="p-5">
            <JourneyChart journey={journey} />
          </div>
        </div>
      </div>

      {/* Consistency — full width. Four behaviours over eight weeks; the
          picture that starts "you've missed Friday five weeks running". */}
      <div className="mb-5">
        <div className="bg-white rounded-lg shadow-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">Consistency</h3>
            <span className="text-[11.5px] text-muted">Last 8 weeks — one cell per day, grouped by week</span>
          </div>
          <div className="p-5">
            <ConsistencyHeatmap series={series} targets={targets} />
          </div>
        </div>
      </div>

      {/* Today — full width meter row, replacing the seven-tile em-dash grid */}
      <div className="mb-5">
        <div className="bg-white rounded-lg shadow-card border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">Today</h3>
            <span className="text-[11.5px] text-muted">
              {(() => {
                const missing = ['steps','calories','protein','carbs','fat','sleep','mood']
                  .filter(k => todayRow[k] == null).length;
                return missing
                  ? `${dateLabel(todayRow.date)} · ${missing} of 7 metrics not logged yet`
                  : `${dateLabel(todayRow.date)} · fully logged`;
              })()}
            </span>
          </div>
          <TodayMeters series={series} targets={targets} session={session} />
        </div>
      </div>

      {/* Main grid: data on left, conversation on right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* LEFT — data cards (3 of 5 cols) */}
        <div className="lg:col-span-3 space-y-5">

          {/* Training programmes — first card, top of column */}
          <Card title="Training programmes">
            {programmes.length === 0 ? (
              <Link
                href={`/dashboard/clients/${client.id}/programs`}
                className="block text-center py-8 border-2 border-dashed border-border rounded hover:border-red hover:bg-bg/40 transition-all group"
              >
                <div className="text-sm text-blue font-bold mb-1 group-hover:text-red transition-colors">
                  + Build first programme
                </div>
                <div className="text-[11px] text-muted">
                  Design a training programme for {firstName}
                </div>
              </Link>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {programmes.slice(0, 4).map(p => (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/clients/${client.id}/programs/${p.id}`}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 group"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-blue text-sm truncate group-hover:text-red transition-colors">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-muted tracking-wide mt-0.5">
                            {p.weeks ? `${p.weeks} week${p.weeks === 1 ? '' : 's'}` : 'No length set'}
                            {p.start_date && <> · starts {dateLabel(p.start_date)}</>}
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-1 rounded flex-shrink-0 border ${
                          p.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          p.status === 'draft'  ? 'bg-bg-alt text-blue border-border' :
                                                  'bg-bg text-muted border-border'
                        }`}>
                          {p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
                  <Link
                    href={`/dashboard/clients/${client.id}/programs`}
                    className="text-[10px] font-bold tracking-[0.15em] uppercase text-red hover:text-red/80 transition-colors inline-block"
                  >
                    + New programme
                  </Link>
                  {programmes.length > 4 && (
                    <Link
                      href={`/dashboard/clients/${client.id}/programs`}
                      className="text-[10px] font-semibold tracking-wider uppercase text-muted hover:text-blue transition-colors"
                    >
                      View all {programmes.length} →
                    </Link>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Athlete profile — the onboarding answers a PT actually coaches from.
              Injuries first (safety), then the why, then logistics. */}
          <Card title="Athlete profile">
            {(() => {
              const days = Array.isArray(client.training_days) ? client.training_days : [];
              const hasWhy = client.motivation || client.why_now || client.biggest_blocker || client.tried_before;
              const hasLogistics = client.experience_level || client.training_style || days.length > 0 ||
                client.training_time || client.session_length_minutes;
              if (!client.injuries && !hasWhy && !hasLogistics) {
                return (
                  <p className="text-[12px] text-muted">
                    Nothing captured yet — {firstName}'s onboarding answers will appear here.
                  </p>
                );
              }
              return (
                <div className="space-y-4">
                  {client.injuries && (
                    <div className="bg-warn-light border border-warn rounded px-3.5 py-2.5">
                      <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-warn-dark mb-1">
                        ⚠ Injuries & limitations
                      </div>
                      <p className="text-[13px] text-blue leading-snug">{client.injuries}</p>
                    </div>
                  )}
                  {hasWhy && (
                    <div className="space-y-2">
                      {client.motivation && (
                        <ProfileLine label="Their why" text={client.motivation} />
                      )}
                      {client.why_now && (
                        <ProfileLine label="Why now" text={client.why_now} />
                      )}
                      {client.biggest_blocker && (
                        <ProfileLine label="Biggest blocker" text={client.biggest_blocker} />
                      )}
                      {client.tried_before && (
                        <ProfileLine label="Tried before" text={client.tried_before} />
                      )}
                    </div>
                  )}
                  {hasLogistics && (
                    <div className="pt-3 border-t border-border grid grid-cols-2 gap-x-4 gap-y-3">
                      {client.experience_level && <Stat label="Experience" value={client.experience_level} />}
                      {client.training_style && <Stat label="Style" value={client.training_style} />}
                      {client.training_time && <Stat label="Prefers" value={client.training_time} />}
                      {client.session_length_minutes && <Stat label="Session length" value={`${client.session_length_minutes} min`} />}
                      {days.length > 0 && (
                        <div className="col-span-2">
                          <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-muted mb-1.5">Training days</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                              <span key={d} className={`text-[10px] font-bold px-2 py-1 rounded ${
                                days.includes(d) ? 'bg-blue text-white' : 'bg-bg text-muted'
                              }`}>{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>

          <Card title="Trends">
            <p className="text-[11.5px] text-muted -mt-1 mb-3">
              7-day average vs the 28-day baseline — biggest movement first.
            </p>
            <TrendRows series={series} targets={targets} sourceNotes={sourceNotes} />
            <p className="text-[11.5px] text-muted mt-3">
              Green means moving toward {firstName}&apos;s goal, not simply &ldquo;up&rdquo;.
            </p>
          </Card>

          <div className="bg-white rounded-lg shadow-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
              <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em]">Strength</h3>
              <span className="text-[11.5px] text-muted">Estimated 1RM over time</span>
            </div>
            <StrengthSmalls lifts={liftSeries} />
          </div>

          {/* Data sources — plumbing status earns a chip strip, not a full card.
              It earns a sentence when it explains a hole in the data. */}
          <Card title="Data sources">
            {devices.length === 0 ? (
              <p className="text-muted text-xs">
                No wearable connected yet — {firstName} can connect Garmin, Oura, Whoop &amp; more
                from the app&apos;s Settings, and activity will land here automatically.
              </p>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {devices.map((d, i) => {
                    const label = d.provider
                      ? d.provider.charAt(0) + d.provider.slice(1).toLowerCase()
                      : 'Device';
                    const lamp =
                      d.status === 'revoked' ? 'bg-muted' :
                      d.status === 'error'   ? 'bg-warn'  : 'bg-emerald-600';
                    const landed = d.last_event_at
                      ? `${timeAgo(d.last_event_at)}${d.last_event_type ? ` · ${d.last_event_type}` : ''}`
                      : d.status === 'revoked'
                        ? `disconnected ${d.revoked_at ? timeAgo(d.revoked_at) : ''}`.trim()
                        : d.status === 'error' ? 'needs reconnecting' : 'no data yet';
                    return (
                      <span key={i}
                        className="inline-flex items-center gap-2 border border-border rounded px-2.5 py-1.5 bg-bg text-[12px]">
                        <i className={`w-[7px] h-[7px] rounded-full ${lamp}`} />
                        <b className="text-blue font-semibold">{label}</b>
                        <span className="text-muted text-[11px]">{landed}</span>
                      </span>
                    );
                  })}
                </div>
                {Object.keys(sourceNotes).length > 0 && (
                  <p className="text-[11.5px] text-muted mt-3 leading-snug">
                    Some trends above are greyed rather than falling — {sourceNotes.sleep}, so those
                    days have no readings rather than bad ones.
                  </p>
                )}
              </>
            )}
          </Card>

          {/* Coach-authored pacts — live panel: add, pause, watch status */}
          <PactsPanel clientId={client.id} />

          {/* Manual nudge — coach brief in, PAX message out, in your voice */}
          <NudgeTool clientId={client.id} clientFirstName={(client.name || '').split(' ')[0]} />

          <Card title="Pact context">
            <div className="space-y-4">

              {/* This week's weekly pact */}
              {weeklyPact && (
                <div className="pt-3 border-t border-border">
                  <SubLabel>This week · {weeklyPact.pact_name || 'unnamed'}</SubLabel>
                  <div className="text-xs text-muted mt-1">
                    Score: {weeklyPact.pact_score ?? 0} · Status: {weeklyPact.status || 'in progress'}
                  </div>
                  {Array.isArray(weeklyPact.commitments) && weeklyPact.commitments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {weeklyPact.commitments.map((c, i) => (
                        <li key={i} className="text-sm text-blue flex items-start gap-2">
                          <span className="text-red mt-1">•</span>
                          <span>{typeof c === 'string' ? c : (c.name || c.label || JSON.stringify(c))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Weekend pact */}
              {weekendPact && (
                <div className="pt-3 border-t border-border">
                  <SubLabel>Weekend pact · {dateLabel(weekendPact.weekend_start)}</SubLabel>
                  <div className="mt-2 space-y-1 text-sm">
                    {weekendPact.saturday_plan && <div><span className="text-[10px] tracking-wider uppercase text-muted mr-2">Sat</span> {weekendPact.saturday_plan}</div>}
                    {weekendPact.sunday_plan   && <div><span className="text-[10px] tracking-wider uppercase text-muted mr-2">Sun</span> {weekendPact.sunday_plan}</div>}
                    {weekendPact.outcome && <div className="text-xs text-muted mt-1.5">Outcome: {weekendPact.outcome}</div>}
                  </div>
                </div>
              )}

              {/* Stakes */}
              {stakes.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <SubLabel>Stakes</SubLabel>
                  <ul className="mt-2 space-y-1.5">
                    {stakes.map((s, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="text-blue">
                          £{s.amount} → {s.charity_name || s.stake_type || 'charity'}
                        </span>
                        <span className="text-xs text-muted">{s.breaks_so_far ?? 0}/{s.trigger_threshold ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cosigners */}
              {cosigners.length > 0 && (
                <div className="pt-3 border-t border-border">
                  <SubLabel>Watching · {cosigners.length}</SubLabel>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {cosigners.map((c, i) => (
                      <span key={i} className="text-[11px] bg-bg-alt text-blue px-2 py-1 rounded">
                        {c.name}{c.relationship ? ` · ${c.relationship}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Nothing at all */}
              {!weeklyPact && !weekendPact && stakes.length === 0 && cosigners.length === 0 && (
                <p className="text-muted text-xs">No weekly pact, stakes or cosigners yet.</p>
              )}
            </div>
          </Card>

          <Card title={`Recent wins (last 14d · ${wins.length})`}>
            {wins.length === 0 ? (
              <p className="text-muted text-xs">No wins logged in this window.</p>
            ) : (
              <ul className="divide-y divide-border">
                {wins.slice(0, 8).map((w, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-blue">{w.description || `${w.pact_type || 'pact'} kept`}</div>
                      <div className="text-[10px] text-muted tracking-wide uppercase mt-0.5">
                        {dateLabel(w.date)}
                        {w.pact_type && <> · {w.pact_type}</>}
                      </div>
                    </div>
                    {w.weight ? (
                      <div className="text-right flex-shrink-0">
                        <div className="font-display font-bold text-emerald-600 text-sm">+{w.weight}</div>
                        <div className="text-[9px] text-muted tracking-wider uppercase">Wt</div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Pact streak · last 14 days">
            {pacts.length === 0 ? (
              <p className="text-muted text-xs">No pacts logged in this window.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pacts.slice().reverse().map(p => (
                  <div
                    key={p.date}
                    title={`${p.date}: ${p.wins_completed ?? 0}/${p.total_wins ?? 0} wins`}
                    className={`w-5 h-5 rounded-sm ${
                      p.status === 'won'     ? 'bg-emerald-500'
                      : p.status === 'partial' ? 'bg-warn'
                      : p.status === 'lost'    ? 'bg-red'
                                               : 'bg-border'
                    }`}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title={`Slips · last 14 days (${slips.length})`}>
            {slips.length === 0 ? (
              <p className="text-muted text-xs">No slip events.</p>
            ) : (
              <ul className="divide-y divide-border">
                {slips.map((s, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0 flex justify-between items-center text-sm">
                    <span className="text-blue font-medium capitalize">{s.event_type?.replace(/_/g, ' ')}</span>
                    <span className="text-muted text-xs">{timeAgo(s.detected_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* RIGHT — conversation, sticky (2 of 5 cols) */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6">
            <div className="bg-white rounded-lg shadow-card border border-border flex flex-col" style={{ maxHeight: 'calc(100vh - 3rem)' }}>
              <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em] px-5 py-4 border-b border-border flex-shrink-0">
                PAX conversation · {messages.length} message{messages.length === 1 ? '' : 's'} <span className="normal-case font-normal text-muted tracking-normal">· newest first</span>
              </h3>
              {messages.length === 0 ? (
                <div className="p-5 text-muted text-xs">No messages yet.</div>
              ) : (
                <div className="flex flex-col gap-2.5 p-4 overflow-y-auto scroll-thin flex-1">
                  {/* Newest at the TOP — the coach reads the latest exchange
                      without scrolling; history continues downward. */}
                  {messages.map((m, i) => {
                    const isUser = m.role === 'user';
                    return (
                      <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] px-3.5 py-2.5 rounded-md text-sm leading-relaxed ${
                            isUser
                              ? 'bg-red text-white rounded-br-sm'
                              : 'bg-bg-alt text-blue rounded-bl-sm'
                          }`}
                        >
                          <div className={`text-[10px] font-semibold tracking-wider uppercase mb-1 ${
                            isUser ? 'text-white/70' : 'text-muted'
                          }`}>
                            {isUser ? firstName : 'PAX'} · {timeAgo(m.created_at)}
                          </div>
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DangerZone clientId={client.id} clientName={client.name || ''} />

      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================
function Card({ title, children }) {
  return (
    <div className="bg-white rounded-lg shadow-card border border-border">
      <h3 className="font-display font-bold text-blue text-[11px] uppercase tracking-[0.15em] px-5 py-4 border-b border-border">
        {title}
      </h3>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function ProfileLine({ label, text }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-muted mb-0.5">{label}</div>
      <p className="text-[13px] text-blue leading-snug">{text}</p>
    </div>
  );
}

function Stat({ label, value, valueClass = 'text-blue' }) {
  return (
    <div>
      <div className={`font-display font-bold text-base leading-none tabular-nums ${valueClass}`}>
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-[0.15em] uppercase text-muted mt-1.5">
        {label}
      </div>
    </div>
  );
}

function MetaDate({ label, date, sublabel }) {
  return (
    <div>
      <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-white/40 mb-1">
        {label}
      </div>
      <div className="text-sm text-white tabular-nums">
        {dateLabel(date)}
      </div>
      {sublabel && (
        <div className="text-[10px] text-white/60 mt-0.5 truncate max-w-[140px]">{sublabel}</div>
      )}
    </div>
  );
}

function SubLabel({ children }) {
  return (
    <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-red">
      {children}
    </div>
  );
}
