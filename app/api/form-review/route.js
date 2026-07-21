/**
 * /api/form-review
 *
 * GET  — the coach's form-review queue: pending clips across the roster,
 *        each with a 1-hour signed URL for playback (bucket is private).
 * POST — { id, coach_note } → mark a clip reviewed with an optional note.
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
    .from('clients').select('id, name').eq('pt_id', pt.id);
  const ids = (clients || []).map((c) => c.id);
  const nameOf = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));
  if (!ids.length) return NextResponse.json({ clips: [] });

  const { data: rows = [] } = await service
    .from('form_clips')
    .select('id, client_id, exercise_name, storage_path, review_status, coach_note, created_at')
    .in('client_id', ids)
    .order('created_at', { ascending: false })
    .limit(30);

  const clips = [];
  for (const r of rows || []) {
    let url = null;
    try {
      const { data: signed } = await service.storage
        .from('form-clips')
        .createSignedUrl(r.storage_path, 3600);
      url = signed?.signedUrl || null;
    } catch (e) {
      console.error('[form-review] sign failed', r.storage_path, e);
    }
    clips.push({
      id: r.id, client: nameOf[r.client_id], exercise: r.exercise_name,
      status: r.review_status, note: r.coach_note, at: r.created_at, url,
    });
  }
  return NextResponse.json({ clips });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!body?.id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  const coach = await requireCoach();
  if (coach.error) return coach.error;

  // Scope: the clip must belong to one of this coach's athletes.
  const { data: clip } = await coach.service
    .from('form_clips').select('id, client_id').eq('id', body.id).maybeSingle();
  if (!clip) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { data: client } = await coach.service
    .from('clients').select('pt_id').eq('id', clip.client_id).maybeSingle();
  if (client?.pt_id !== coach.pt.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const { error } = await coach.service
    .from('form_clips')
    .update({
      review_status: 'reviewed',
      coach_note: typeof body.coach_note === 'string' ? body.coach_note.trim().slice(0, 500) || null : null,
    })
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
