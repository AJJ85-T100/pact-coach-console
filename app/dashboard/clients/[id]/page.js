import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

function avg(arr) {
  if (!arr || !arr.length) return null;
  const sum = arr.reduce((s, v) => s + (v ?? 0), 0);
  return sum / arr.length;
}

function fmt(n, digits = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(digits);
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

  const sevenAgoStr = sevenAgo.toLocaleDateString('en-CA');
  const fourteenAgoStr = fourteenAgo.toLocaleDateString('en-CA');
  const twentyEightAgoStr = twentyEightAgo.toLocaleDateString('en-CA');
  const eightWeeksAgoStr  = eightWeeksAgo.toLocaleDateString('en-CA');

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
    progsR,
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

    // Daily pacts last 14 days
    service.from('daily_pacts')
      .select('date, status, wins_completed, total_wins')
      .eq('client_id', client.id)
      .gte('date', fourteenAgoStr)
      .order('date', { ascending: false }),

    // Health data last 28 days (used for today + averages)
    service.from('health_data')
      .select('steps, calories, protein, carbs, fat, raw, created_at')
      .eq('client_id', client.id)
      .gte('created_at', twentyEightAgo.toISOString())
      .order('created_at', { ascending: false }),

    // Latest weigh-in
    service.from('weigh_ins')
      .select('weight, date, created_at')
      .eq('client_id', client.id)
      .not('weight', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),

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

    // Mood — latest
    service.from('mood_ratings')
      .select('rating, date, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1),

    // Training programmes — non-archived, newest first
    service.from('programs')
      .select('id, name, status, weeks, start_date, updated_at')
      .eq('client_id', client.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false }),
  ]);

  // ============================================================
  // Derive
  // ============================================================
  const messages   = msgsR.data    || [];
  const slips      = slipsR.data   || [];
  const pacts      = pactsR.data   || [];
  const healthAll  = healthR.data  || [];
  const lastWeigh  = weighR.data?.[0] || null;
  const lifts      = liftsR.data   || [];
  const customPacts = customPactsR.data || [];
  const weeklyPact  = weeklyPactR.data  || null;
  const weekendPact = weekendPactR.data || null;
  const stakes      = stakesR.data  || [];
  const cosigners   = cosignersR.data || [];
  const wins        = winStackR.data || [];
  const mood        = moodR.data?.[0] || null;
  const programmes  = progsR.data || [];

  // Current weight: prefer latest weigh_in over (possibly stale) clients.current_weight
  const currentWeight = lastWeigh?.weight ?? client.current_weight;
  const lost = (client.start_weight != null && currentWeight != null)
    ? +(client.start_weight - currentWeight).toFixed(1) : null;
  const toGo = (currentWeight != null && client.target_weight != null)
    ? +(currentWeight - client.target_weight).toFixed(1) : null;

  // Today's health = today's row in healthAll, or the most recent if today isn't logged
  const todayStr = today.toLocaleDateString('en-CA');
  const todayHealth = healthAll.find(h => h.created_at?.split('T')[0] === todayStr) || healthAll[0] || null;
  const sleep = todayHealth?.raw?.sleep ?? null;

  // 7d and 28d averages
  const sevenAgoIso = sevenAgo.toISOString();
  const last7 = healthAll.filter(h => h.created_at >= sevenAgoIso);
  const avg7  = {
    steps:   avg(last7.map(h => h.steps).filter(Boolean)),
    protein: avg(last7.map(h => h.protein).filter(Boolean)),
    carbs:   avg(last7.map(h => h.carbs).filter(Boolean)),
    fat:     avg(last7.map(h => h.fat).filter(Boolean)),
    calories: avg(last7.map(h => h.calories).filter(Boolean)),
    sleep:   avg(last7.map(h => h.raw?.sleep).filter(Boolean)),
  };
  const avg28 = {
    steps:   avg(healthAll.map(h => h.steps).filter(Boolean)),
    protein: avg(healthAll.map(h => h.protein).filter(Boolean)),
    carbs:   avg(healthAll.map(h => h.carbs).filter(Boolean)),
    fat:     avg(healthAll.map(h => h.fat).filter(Boolean)),
    calories: avg(healthAll.map(h => h.calories).filter(Boolean)),
    sleep:   avg(healthAll.map(h => h.raw?.sleep).filter(Boolean)),
  };

  // Lift trend: latest vs ~4 weeks ago. If <2 entries we can't trend.
  const latestLift = lifts[0] || null;
  const olderLift  = lifts.find(l => {
    const ld = new Date(l.recorded_date);
    return (today - ld) > 21 * 24 * 60 * 60 * 1000; // older than 3 weeks
  }) || lifts[lifts.length - 1] || null;

  const liftTrend = (key) => {
    if (!latestLift || !olderLift || latestLift === olderLift) return 'flat';
    const cur = latestLift[key];
    const old = olderLift[key];
    if (cur == null || old == null) return 'flat';
    if (cur > old + 1) return 'up';
    if (cur < old - 1) return 'down';
    return 'flat';
  };

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

          <Card title="Journey">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Stat label="Start"   value={client.start_weight ? `${client.start_weight}kg` : '—'} />
              <Stat label="Current" value={currentWeight        ? `${currentWeight}kg`        : '—'} />
              <Stat label="Target"  value={client.target_weight ? `${client.target_weight}kg` : '—'} />
            </div>
            <div className="pt-3 border-t border-border grid grid-cols-2 gap-4">
              {lost !== null && lost >= 0 && (
                <Stat label="Lost"   value={`${lost}kg`} valueClass="text-red" />
              )}
              {lost !== null && lost < 0 && (
                <Stat label="Gained" value={`${Math.abs(lost)}kg`} valueClass="text-blue" />
              )}
              {toGo !== null && toGo > 0 && (
                <Stat label="To go" value={`${toGo}kg`} valueClass="text-blue" />
              )}
              {toGo !== null && toGo <= 0 && (
                <Stat label="Past target by" value={`${Math.abs(toGo)}kg`} valueClass="text-emerald-700" />
              )}
            </div>
            {lastWeigh && (
              <p className="text-[10px] text-muted mt-3 tracking-wide">
                Last weigh-in: {timeAgo(lastWeigh.created_at)}
              </p>
            )}
          </Card>

          <Card title="Today's snapshot">
            {todayHealth ? (
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Steps"    value={(todayHealth.steps || 0).toLocaleString()} />
                <Stat label="Calories" value={todayHealth.calories ? Math.round(todayHealth.calories) : '—'} />
                <Stat label="Protein"  value={todayHealth.protein  ? `${Math.round(todayHealth.protein)}g`  : '—'} />
                <Stat label="Carbs"    value={todayHealth.carbs    ? `${Math.round(todayHealth.carbs)}g`    : '—'} />
                <Stat label="Fat"      value={todayHealth.fat      ? `${Math.round(todayHealth.fat)}g`      : '—'} />
                <Stat label="Sleep"    value={sleep ? `${sleep.toFixed(1)}h` : '—'} />
                <Stat label="Mood"     value={mood?.rating ? `${mood.rating.toFixed(1)}/5` : '—'} />
              </div>
            ) : (
              <p className="text-muted text-xs">No health data yet today.</p>
            )}
          </Card>

          <Card title="Rolling averages">
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
              <div></div>
              <div className="text-[10px] font-bold text-muted tracking-[0.15em] uppercase">7-day</div>
              <div className="text-[10px] font-bold text-muted tracking-[0.15em] uppercase">28-day</div>

              <AvgRow label="Steps"    val7={fmt(avg7.steps)}     val28={fmt(avg28.steps)} />
              <AvgRow label="Calories" val7={fmt(avg7.calories)}  val28={fmt(avg28.calories)} />
              <AvgRow label="Protein"  val7={fmt(avg7.protein) + 'g'} val28={fmt(avg28.protein) + 'g'} />
              <AvgRow label="Carbs"    val7={fmt(avg7.carbs)   + 'g'} val28={fmt(avg28.carbs)   + 'g'} />
              <AvgRow label="Fat"      val7={fmt(avg7.fat)     + 'g'} val28={fmt(avg28.fat)     + 'g'} />
              <AvgRow label="Sleep"    val7={fmt(avg7.sleep, 1) + 'h'} val28={fmt(avg28.sleep, 1) + 'h'} />
            </div>
          </Card>

          <Card title="Compound lifts">
            {!latestLift ? (
              <p className="text-muted text-xs">No lifts recorded yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <LiftStat label="Squat"    value={latestLift.squat}        trend={liftTrend('squat')} />
                  <LiftStat label="Bench"    value={latestLift.bench_press}  trend={liftTrend('bench_press')} />
                  <LiftStat label="Deadlift" value={latestLift.deadlift}     trend={liftTrend('deadlift')} />
                  <LiftStat label="OHP"      value={latestLift.ohp}          trend={liftTrend('ohp')} />
                </div>
                <p className="text-[10px] text-muted tracking-wide">
                  Last recorded: {dateLabel(latestLift.recorded_date)}
                  {olderLift && olderLift !== latestLift && (
                    <> · trend vs {dateLabel(olderLift.recorded_date)}</>
                  )}
                </p>
              </>
            )}
          </Card>

          <Card title="Active pacts">
            <div className="space-y-4">

              {/* Custom pacts */}
              {customPacts.length === 0 ? (
                <p className="text-muted text-xs">No custom pacts active.</p>
              ) : (
                <div>
                  <SubLabel>Custom · {customPacts.length}</SubLabel>
                  <ul className="space-y-2 mt-2">
                    {customPacts.map((p, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-semibold text-blue">{p.name}</div>
                          {p.rule && <div className="text-xs text-muted">{p.rule}</div>}
                          {p.cadence && <div className="text-[10px] text-muted tracking-wider uppercase mt-0.5">{p.cadence}</div>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-display font-bold text-blue text-base">{p.current_streak ?? 0}</div>
                          <div className="text-[9px] text-muted tracking-wider uppercase">Streak</div>
                          {p.longest_streak ? (
                            <div className="text-[9px] text-muted mt-0.5">Best: {p.longest_streak}</div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
              {customPacts.length === 0 && !weeklyPact && !weekendPact && stakes.length === 0 && cosigners.length === 0 && (
                <p className="text-muted text-xs">Nothing committed yet. PAX will help build the first pact.</p>
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
                PAX conversation · {messages.length} message{messages.length === 1 ? '' : 's'}
              </h3>
              {messages.length === 0 ? (
                <div className="p-5 text-muted text-xs">No messages yet.</div>
              ) : (
                <div className="flex flex-col gap-2.5 p-4 overflow-y-auto scroll-thin flex-1">
                  {messages.slice().reverse().map((m, i) => {
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

function AvgRow({ label, val7, val28 }) {
  return (
    <>
      <div className="text-muted">{label}</div>
      <div className="font-display font-bold text-blue tabular-nums">{val7}</div>
      <div className="font-display text-muted tabular-nums">{val28}</div>
    </>
  );
}

function LiftStat({ label, value, trend }) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red' : 'text-muted';

  return (
    <div className="bg-bg rounded p-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted mb-1">{label}</div>
        <div className="font-display font-bold text-blue text-lg tabular-nums leading-none">
          {value != null ? `${value}` : '—'}
          {value != null && <span className="text-xs text-muted font-medium ml-1">kg</span>}
        </div>
      </div>
      <div className={`text-2xl font-bold ${trendColor}`}>{trendIcon}</div>
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
