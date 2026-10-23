import OutcomesPanel from '@/components/OutcomesPanel';
import { TodayProvider } from '@/components/today/TodayContext';
import {
  TodayHeader, Escalations, Moves, Drafts, Drifting, ConsentNeeded, QueueClear, AutonomyCard, AutoLog,
} from '@/components/today/TodayQueue';
import { RevenueStrip, RosterToday, PaxToday, AthletesReplying, OnboardingFunnel } from '@/components/today/TodayCards';
import s from '@/components/today/today.module.css';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { engineFetch } from '@/lib/engine';
import {
  londonKey, addDaysKey, isActive, latestStateByClient, rosterBands, revenue,
  paxToday, groupAutoLog, replyDays, onboardingFunnel,
} from '@/lib/today/derive';

export const dynamic = 'force-dynamic';

// ============================================================
// Today — the coach's home.
//
// Reads: personal_trainers + clients (service role, scoped by pt_id, select
// '*' so new columns are read defensively), V2 tables through the coach's
// own session (RLS: athlete_state_daily, interventions, intervention_outcomes,
// coach_labels, consents), the engine as the coach (roster; and, client-side,
// needs-you + autonomy). Any query that fails leaves its card quieter.
// ============================================================

const LOG_EVENT_KINDS = ['session_done', 'set_logged', 'food_logged', 'weigh_in', 'mood', 'checkin'];

/** Which of `ids` have at least one row in `table` (bounded, handles heavy loggers). */
async function idsWithRows(db, table, ids, extra) {
  const found = new Set();
  let remaining = [...ids];
  for (let pass = 0; pass < 6 && remaining.length; pass++) {
    let q = db.from(table).select('client_id').in('client_id', remaining).limit(1000);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error || !data?.length) break;
    const before = found.size;
    data.forEach((r) => found.add(r.client_id));
    remaining = remaining.filter((id) => !found.has(id));
    if (data.length < 1000 || found.size === before) break;
  }
  return found;
}

const safe = (r) => (r && !r.error ? r.data || [] : []);

export default async function TodayPage() {
  const supabase = createClient();
  const { data: { user } = {} } = await supabase.auth.getUser();
  const service = createServiceClient();

  const { data: pt } = user
    ? await service.from('personal_trainers').select('*').eq('auth_user_id', user.id).maybeSingle()
    : { data: null };

  let clients = [];
  if (pt?.id) {
    const { data } = await service.from('clients').select('*').eq('pt_id', pt.id).order('name');
    clients = data || [];
  }
  const active = clients.filter(isActive);
  const activeIds = active.map((c) => c.id);
  const nameBy = Object.fromEntries(clients.map((c) => [c.id, c.name || 'Athlete']));

  const now = new Date();
  const todayKey = londonKey(now);
  const since26h = new Date(now.getTime() - 26 * 3600e3).toISOString();
  const since8d = new Date(now.getTime() - 8 * 864e5).toISOString();

  let stateRows = [], ivRows = [], labelRows = [], outcomeRows = [], consentRows = [], openInvites = [], roster = null;
  if (pt?.id) {
    const [stateR, ivR, labR, outR, consR, invR, rosterR] = await Promise.all([
      activeIds.length
        ? supabase.from('athlete_state_daily')
          .select('client_id, date, slip_risk, adherence_7d, adherence_28d, days_silent')
          .in('client_id', activeIds)
          .gte('date', addDaysKey(todayKey, -7))
          .limit(5000)
        : Promise.resolve({ data: [] }),
      supabase.from('interventions')
        .select('id, client_id, type, initiated_by, delivery_status, occurred_at, decision')
        .eq('pt_id', pt.id)
        .gte('occurred_at', since26h)
        .order('occurred_at', { ascending: true })
        .limit(3000),
      supabase.from('coach_labels')
        .select('intervention_id, label, edit_text, created_at')
        .eq('pt_id', pt.id)
        .gte('created_at', since26h)
        .limit(3000),
      // 4 h outcome of each message sent in the last week (RLS: outcomes_coach_read)
      supabase.from('intervention_outcomes')
        .select('replied, interventions!inner(occurred_at, type, pt_id)')
        .eq('horizon', '4h')
        .eq('status', 'resolved')
        .eq('interventions.pt_id', pt.id)
        .gte('interventions.occurred_at', since8d)
        .limit(5000),
      activeIds.length
        ? supabase.from('consents').select('client_id, purpose, withdrawn_at').in('client_id', activeIds)
        : Promise.resolve({ data: [] }),
      service.from('invite_tokens')
        .select('id, client_name, expires_at')
        .eq('pt_id', pt.id)
        .is('used_at', null)
        .gte('expires_at', now.toISOString())
        .limit(200),
      engineFetch('/v1/coach/roster'),
    ]);
    stateRows = safe(stateR);
    ivRows = safe(ivR);
    labelRows = safe(labR);
    outcomeRows = safe(outR).map((o) => ({ replied: o.replied, occurred_at: o.interventions?.occurred_at, type: o.interventions?.type })).filter((o) => o.occurred_at);
    consentRows = safe(consR);
    openInvites = safe(invR);
    roster = rosterR.status === 200 && Array.isArray(rosterR.json?.athletes) ? rosterR.json.athletes : null;
  }

  // ---------------- Derive
  const stateBy = latestStateByClient(stateRows);
  const bands = rosterBands(active, stateBy);
  const rev = revenue({ clients, active, drifting: bands.drifting_list, pt, todayKey });
  const pax = paxToday({ ivs: ivRows, labels: labelRows, todayKey });
  const autoGroups = groupAutoLog(pax.auto, nameBy);
  const reply = replyDays(outcomeRows, todayKey);

  // First log: only worth checking for athletes who've reached that step.
  let loggedIds = new Set();
  if (activeIds.length) {
    const preFunnel = onboardingFunnel({ active, openInvites, roster, consentRows, loggedIds: new Set() });
    const candidates = new Set(preFunnel.stages[3].stuck.map((p) => p.clientId));
    let remaining = [...candidates];
    const checks = [
      [supabase, 'athlete_events', (q) => q.in('kind', LOG_EVENT_KINDS)],
      [service, 'workout_logs'],
      [service, 'weigh_ins'],
      [service, 'health_data'],
      [service, 'mood_ratings'],
    ];
    for (const [db, table, extra] of checks) {
      if (!remaining.length) break;
      const hit = await idsWithRows(db, table, remaining, extra);
      hit.forEach((id) => loggedIds.add(id));
      remaining = remaining.filter((id) => !loggedIds.has(id));
    }
  }
  const funnel = onboardingFunnel({ active, openInvites, roster, consentRows, loggedIds });

  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

  return (
    <TodayProvider drifting={bands.drifting_list} hasState={bands.hasState}>
      <div className={s.page}>
        <TodayHeader dateLabel={dateLabel} sentOwn={pax.sentOwn} />

        <RevenueStrip rev={rev} />

        <div className={s.grid}>
          <div className={s.main}>
            <QueueClear />
            <Escalations />
            <Moves />
            <Drafts />
            <div className={s.pair}>
              <Drifting />
              <ConsentNeeded />
            </div>
            <AutonomyCard />
            <OnboardingFunnel funnel={funnel} />
            <AutoLog groups={autoGroups} total={pax.sentOwn} />
          </div>

          <div className={s.side}>
            <RosterToday bands={bands} />
            <PaxToday sentOwn={pax.sentOwn} drafted={pax.drafted} escalated={pax.escalated} />
            <AthletesReplying reply={reply} />
          </div>
        </div>

        <div id="whats-working">
          <OutcomesPanel />
        </div>
      </div>
    </TodayProvider>
  );
}
