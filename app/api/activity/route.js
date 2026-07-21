/**
 * /api/activity
 *
 * GET — the coach's incoming-activity feed: everything athletes have logged
 * recently, across the roster, in one merged stream —
 *   • workout_logs  (sessions from the athlete app: kept counts, RPE, volume)
 *   • activities    (runs / rides / walks — Terra wearables + manual logs)
 *   • weigh_ins     (scale entries)
 * plus a 7-day per-athlete rollup for the summary strip.
 *
 * Server-side service client (RLS-immune), coach-scoped via requireCoach.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireCoach } from '@/lib/auth/requireCoach';

export const dynamic = 'force-dynamic';

export async function GET() {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;
  const { pt, service } = coach;

  const { data: clients = [] } = await service
    .from('clients')
    .select('id, name')
    .eq('pt_id', pt.id);
  const ids = (clients || []).map((c) => c.id);
  const nameOf = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));
  if (!ids.length) return NextResponse.json({ feed: [], rollup: [] });

  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  const [wl, acts, wis] = await Promise.all([
    service.from('workout_logs')
      .select('client_id, date, session_name, status, exercises_kept, exercises_total, avg_rpe, total_volume, created_at')
      .in('client_id', ids).order('created_at', { ascending: false }).limit(30),
    service.from('activities')
      .select('client_id, date, type, name, source, distance_m, duration_s, avg_hr, calories, created_at')
      .in('client_id', ids).order('created_at', { ascending: false }).limit(30),
    service.from('weigh_ins')
      .select('client_id, date, weight, created_at')
      .in('client_id', ids).order('created_at', { ascending: false }).limit(30),
  ]);

  const feed = [
    ...(wl.data || []).map((r) => ({
      kind: 'session', client: nameOf[r.client_id], clientId: r.client_id,
      date: r.date, at: r.created_at,
      title: r.session_name || 'Session',
      detail: `${r.exercises_kept ?? '?'} of ${r.exercises_total ?? '?'} exercises · ${r.status}` +
        (r.avg_rpe ? ` · avg RPE ${r.avg_rpe}` : '') +
        (r.total_volume ? ` · ${r.total_volume >= 1000 ? (r.total_volume / 1000).toFixed(1) + 't' : Math.round(r.total_volume) + 'kg'} volume` : ''),
    })),
    ...(acts.data || []).map((r) => ({
      kind: r.type || 'cardio', client: nameOf[r.client_id], clientId: r.client_id,
      date: r.date, at: r.created_at,
      title: r.name || (r.type ? r.type[0].toUpperCase() + r.type.slice(1) : 'Activity'),
      detail: [
        r.distance_m ? (r.distance_m / 1000).toFixed(1) + ' km' : null,
        r.duration_s ? Math.round(r.duration_s / 60) + ' min' : null,
        r.avg_hr ? r.avg_hr + ' bpm avg' : null,
        r.calories ? r.calories + ' kcal' : null,
        r.source === 'manual' ? 'logged manually' : 'via wearable',
      ].filter(Boolean).join(' · '),
    })),
    ...(wis.data || []).map((r) => ({
      kind: 'weigh-in', client: nameOf[r.client_id], clientId: r.client_id,
      date: r.date, at: r.created_at,
      title: `${Number(r.weight).toFixed(1)} kg`,
      detail: 'weigh-in',
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);

  const rollup = (clients || []).map((c) => {
    const sessions = (wl.data || []).filter((r) => r.client_id === c.id && r.date >= since);
    const cardio   = (acts.data || []).filter((r) => r.client_id === c.id && r.date >= since);
    const weighs   = (wis.data || []).filter((r) => r.client_id === c.id && r.date >= since);
    const km = cardio.reduce((s, r) => s + (Number(r.distance_m) || 0), 0) / 1000;
    return {
      clientId: c.id, name: c.name,
      sessions: sessions.length,
      cardio: cardio.length,
      km: +km.toFixed(1),
      lastWeighIn: weighs[0] ? Number(weighs[0].weight).toFixed(1) : null,
    };
  }).sort((a, b) => (b.sessions + b.cardio) - (a.sessions + a.cardio));

  return NextResponse.json(
    { feed, rollup },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}
