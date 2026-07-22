/**
 * /api/templates — the coach's programme-template library.
 *
 * GET    — list this coach's templates (with session/exercise counts).
 * POST   — create a template:
 *            { program_id, name? }  → snapshot an existing programme
 *                                     (metadata + all sessions + exercises);
 *            { name, weeks?, notes?, sessions? } → create directly.
 * DELETE — ?id=…  remove one of this coach's templates.
 *
 * Templates are per-coach. Loading one onto a client happens in
 * POST /api/clients/[clientId]/programs via template_id.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireCoach, requireProgramAccess } from '@/lib/auth/requireCoach';
import { sanitizeExercises } from '@/lib/programs/sanitizeExercises';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };

function sanitizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .filter((s) => s && typeof s === 'object' && typeof s.name === 'string' && s.name.trim())
    .slice(0, 200)
    .map((s) => ({
      name: s.name.trim().slice(0, 200),
      week_number: Number.isFinite(Number(s.week_number))
        ? Math.max(1, Math.min(52, Math.floor(Number(s.week_number)))) : 1,
      day_index: Number.isFinite(Number(s.day_index))
        ? Math.max(1, Math.min(7, Math.floor(Number(s.day_index)))) : 1,
      notes: typeof s.notes === 'string' ? s.notes.trim() || null : null,
      exercises: sanitizeExercises(Array.isArray(s.exercises) ? s.exercises : []),
    }));
}

export async function GET() {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const { data, error } = await supabase
    .from('program_templates')
    .select('id, name, weeks, notes, sessions, created_at, updated_at')
    .eq('pt_id', coach.pt.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[templates] list failed', error);
    return NextResponse.json({ error: 'Could not load templates.' }, { status: 500 });
  }

  const templates = (data || []).map((t) => {
    const sessions = Array.isArray(t.sessions) ? t.sessions : [];
    return {
      id: t.id,
      name: t.name,
      weeks: t.weeks,
      notes: t.notes,
      session_count: sessions.length,
      exercise_count: sessions.reduce((n, s) => n + (Array.isArray(s.exercises) ? s.exercises.length : 0), 0),
      week_span: sessions.length ? Math.max(...sessions.map((s) => s.week_number || 1)) : 0,
      created_at: t.created_at,
      updated_at: t.updated_at,
    };
  });

  return NextResponse.json({ templates }, { headers: noStoreHeaders });
}

export async function POST(req) {
  noStore();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // --- Snapshot an existing programme ---------------------------------------
  if (body?.program_id) {
    const access = await requireProgramAccess(body.program_id);
    if (access.error) return access.error;

    const [{ data: program }, { data: sessions }] = await Promise.all([
      supabase.from('programs')
        .select('id, name, weeks, notes')
        .eq('id', body.program_id).maybeSingle(),
      supabase.from('program_sessions')
        .select('name, week_number, day_index, notes, exercises')
        .eq('program_id', body.program_id)
        .order('week_number', { ascending: true })
        .order('day_index', { ascending: true }),
    ]);

    if (!program) return NextResponse.json({ error: 'Programme not found.' }, { status: 404 });

    const name = (typeof body.name === 'string' && body.name.trim())
      ? body.name.trim().slice(0, 200)
      : program.name;

    const { data: tpl, error } = await supabase
      .from('program_templates')
      .insert({
        pt_id: access.pt.id,
        name,
        weeks: program.weeks || null,
        notes: program.notes || null,
        sessions: sanitizeSessions(sessions || []),
        source_program_id: program.id,
      })
      .select('id, name')
      .single();

    if (error) {
      console.error('[templates] snapshot failed', error);
      return NextResponse.json({ error: 'Could not save the template.' }, { status: 500 });
    }
    return NextResponse.json({ template: tpl }, { status: 201, headers: noStoreHeaders });
  }

  // --- Direct create --------------------------------------------------------
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) return NextResponse.json({ error: 'Template name is required.' }, { status: 400 });

  const { data: tpl, error } = await supabase
    .from('program_templates')
    .insert({
      pt_id: coach.pt.id,
      name,
      weeks: Number.isFinite(Number(body.weeks)) && Number(body.weeks) > 0
        ? Math.min(52, Math.floor(Number(body.weeks))) : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      sessions: sanitizeSessions(body.sessions),
    })
    .select('id, name')
    .single();

  if (error) {
    console.error('[templates] create failed', error);
    return NextResponse.json({ error: 'Could not create the template.' }, { status: 500 });
  }
  return NextResponse.json({ template: tpl }, { status: 201, headers: noStoreHeaders });
}

export async function DELETE(req) {
  noStore();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const { data: tpl } = await supabase
    .from('program_templates').select('id, pt_id').eq('id', id).maybeSingle();
  if (!tpl || tpl.pt_id !== coach.pt.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { error } = await supabase.from('program_templates').delete().eq('id', id);
  if (error) {
    console.error('[templates] delete failed', error);
    return NextResponse.json({ error: 'Could not delete.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders });
}
