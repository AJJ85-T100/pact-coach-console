/**
 * /api/reports/roster?weeks_ago=N
 *
 * Computed (no-AI) weekly stats for every client on the coach's roster, plus a
 * roster-wide summary. Powers the PAX reports list + the summary row. Cheap:
 * a handful of batched queries, no model calls. The per-client AI narrative is
 * generated separately, on selection, via /api/reports/[clientId].
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY = 86400000;

function pct(wins, total) {
  return total > 0 ? Math.round((wins / total) * 100) : null;
}

function statusOf({ adherencePct, daysLogged }) {
  if (daysLogged === 0 || adherencePct == null) return 'at_risk';
  if (adherencePct < 30) return 'at_risk';
  if (adherencePct < 55) return 'watch';
  if (adherencePct < 80) return 'on_track';
  return 'strong';
}

export async function GET(req) {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const weeksAgo = Math.max(0, parseInt(new URL(req.url).searchParams.get('weeks_ago') || '0', 10) || 0);

  const service = createServiceClient();
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const { data: clients } = await service
    .from('clients')
    .select('id, name, goal, current_weight, target_weight, start_date, status')
    .eq('pt_id', pt?.id || null)
    .order('name', { ascending: true });

  const list = clients || [];
  const ids = list.map((c) => c.id);

  const now = Date.now();
  const end = now - weeksAgo * 7 * DAY;
  const thisStart = new Date(end - 7 * DAY).toISOString().slice(0, 10);
  const thisEnd = new Date(end).toISOString().slice(0, 10);
  const prevStart = new Date(end - 14 * DAY).toISOString().slice(0, 10);

  let thisRows = [];
  let prevRows = [];
  let customRows = [];
  let progRows = [];

  if (ids.length) {
    const [a, b, c, d] = await Promise.all([
      service.from('daily_pacts').select('client_id, wins_completed, total_wins, status').in('client_id', ids).gt('date', thisStart).lte('date', thisEnd),
      service.from('daily_pacts').select('client_id, wins_completed, total_wins').in('client_id', ids).gt('date', prevStart).lte('date', thisStart),
      service.from('custom_pacts').select('client_id, current_streak').in('client_id', ids),
      service.from('programs').select('client_id, name, weeks, start_date').in('client_id', ids).eq('status', 'active'),
    ]);
    thisRows = a.data || [];
    prevRows = b.data || [];
    customRows = c.data || [];
    progRows = d.data || [];
  }

  const byClient = (rows) => {
    const m = {};
    for (const r of rows) (m[r.client_id] = m[r.client_id] || []).push(r);
    return m;
  };
  const thisBy = byClient(thisRows);
  const prevBy = byClient(prevRows);
  const customBy = byClient(customRows);
  const progBy = {};
  for (const p of progRows) if (!progBy[p.client_id]) progBy[p.client_id] = p;

  const out = list.map((c) => {
    const t = thisBy[c.id] || [];
    const p = prevBy[c.id] || [];
    const wins = t.reduce((s, r) => s + (r.wins_completed || 0), 0);
    const total = t.reduce((s, r) => s + (r.total_wins || 0), 0);
    const pWins = p.reduce((s, r) => s + (r.wins_completed || 0), 0);
    const pTotal = p.reduce((s, r) => s + (r.total_wins || 0), 0);
    const adherencePct = pct(wins, total);
    const prevPct = pct(pWins, pTotal);
    const delta = adherencePct != null && prevPct != null ? adherencePct - prevPct : null;
    const daysLogged = t.length;
    const slipDays = t.filter((r) => (r.status && r.status !== 'kept') || (r.total_wins && r.wins_completed < r.total_wins)).length;
    const streak = (customBy[c.id] || []).reduce((m, r) => Math.max(m, r.current_streak || 0), 0);

    const prog = progBy[c.id] || null;
    let programWeek = null;
    if (prog?.start_date) {
      const wk = Math.floor((end - new Date(prog.start_date).getTime()) / (7 * DAY)) + 1;
      if (wk >= 1) programWeek = Math.min(wk, prog.weeks || wk);
    }

    const stats = { adherencePct, prevPct, delta, wins, total, daysLogged, slipDays, streak };
    return {
      id: c.id,
      name: c.name,
      goal: c.goal || null,
      current_weight: c.current_weight ?? null,
      target_weight: c.target_weight ?? null,
      program_name: prog?.name || null,
      program_week: programWeek,
      program_weeks: prog?.weeks || null,
      status: statusOf(stats),
      stats,
    };
  });

  const summary = {
    total: out.length,
    strong: out.filter((c) => c.status === 'strong').length,
    on_track: out.filter((c) => c.status === 'on_track').length,
    watch: out.filter((c) => c.status === 'watch').length,
    at_risk: out.filter((c) => c.status === 'at_risk').length,
    pacts_kept: out.reduce((s, c) => s + c.stats.wins, 0),
    pacts_total: out.reduce((s, c) => s + c.stats.total, 0),
  };

  return NextResponse.json(
    { week_ending: thisEnd, weeks_ago: weeksAgo, summary, clients: out },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
