/**
 * /api/clients/[clientId]/coach-context
 *
 * Lightweight athlete context for the programme editor's side rail: active
 * pacts (and who set them), this week's weekly pact, the 14-day pact streak
 * grid, and recent wins — so the coach programmes with the athlete's actual
 * momentum in view.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

export async function GET(_req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId;
  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayStr = monday.toLocaleDateString('en-CA');

  const [pactsR, dailyR, winsR, weeklyR] = await Promise.all([
    supabase.from('custom_pacts')
      .select('name, rule, cadence, current_streak, longest_streak, created_by, status')
      .eq('client_id', clientId).eq('status', 'active')
      .order('created_at', { ascending: true }),
    supabase.from('daily_pacts')
      .select('date, status, wins_completed, total_wins')
      .eq('client_id', clientId).gte('date', fourteenAgo)
      .order('date', { ascending: true }),
    supabase.from('win_stack')
      .select('date, pact_type, description, created_at')
      .eq('client_id', clientId).gte('date', fourteenAgo)
      .order('created_at', { ascending: false }).limit(6),
    supabase.from('weekly_pacts')
      .select('pact_name, pact_score, status, week_start')
      .eq('client_id', clientId).eq('week_start', mondayStr).limit(1),
  ]);

  return NextResponse.json(
    {
      pacts: pactsR.data || [],
      streak: dailyR.data || [],
      wins: winsR.data || [],
      weekly: weeklyR.data?.[0] || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
