/**
 * /api/clients/[clientId]/exercise-history?name=Back%20Squat
 *
 * The athlete's recent logged performances of one exercise — shown in the
 * programme editor at the point of prescription ("last time: 70kg × 8 @ RPE 8")
 * so the coach sets loads from data, not memory.
 *
 * Reads workout_logs (dates) + set_logs (working sets, is_warmup=false),
 * exact case-insensitive name match, newest 3 sessions.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

export async function GET(req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId;
  const name = (new URL(req.url).searchParams.get('name') || '').trim();

  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'name required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  // Recent workouts first (bounded), then this exercise's working sets in them.
  const { data: logs, error: logsErr } = await supabase
    .from('workout_logs')
    .select('id, date, session_name')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(40);

  if (logsErr) {
    console.error('[exercise-history] logs failed', logsErr);
    return NextResponse.json({ error: 'Could not load history.' }, { status: 500 });
  }
  if (!logs?.length) return NextResponse.json({ history: [] });

  const logById = Object.fromEntries(logs.map((l) => [l.id, l]));
  const { data: sets, error: setsErr } = await supabase
    .from('set_logs')
    .select('workout_log_id, set_index, weight, reps, rpe, prescribed_weight, prescribed_reps')
    .in('workout_log_id', logs.map((l) => l.id))
    .ilike('exercise_name', name)
    .eq('is_warmup', false)
    .order('set_index', { ascending: true });

  if (setsErr) {
    console.error('[exercise-history] sets failed', setsErr);
    return NextResponse.json({ error: 'Could not load history.' }, { status: 500 });
  }

  const byLog = new Map();
  for (const s of sets || []) {
    if (!byLog.has(s.workout_log_id)) byLog.set(s.workout_log_id, []);
    byLog.get(s.workout_log_id).push(s);
  }

  const history = [...byLog.entries()]
    .map(([logId, rows]) => {
      const log = logById[logId];
      const top = rows.reduce((best, r) =>
        (r.weight ?? -1) > (best?.weight ?? -1) ? r : best, null);
      return {
        date: log?.date || null,
        session_name: log?.session_name || null,
        sets: rows.map((r) => ({ weight: r.weight, reps: r.reps, rpe: r.rpe })),
        top_set: top ? { weight: top.weight, reps: top.reps, rpe: top.rpe } : null,
      };
    })
    .filter((h) => h.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  return NextResponse.json({ history }, { headers: { 'Cache-Control': 'no-store' } });
}
