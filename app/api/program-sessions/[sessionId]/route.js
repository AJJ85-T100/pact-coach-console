/**
 * /api/program-sessions/[sessionId]
 *
 * PATCH  — Update a session. Used for editing session metadata (name, week,
 *          day_index, notes) and for replacing the exercises JSONB array
 *          when adding/editing/removing exercises.
 * DELETE — Remove a session and all its exercises.
 *
 * Exercises are sent as a complete replacement array — simpler than diffing
 * and matches the JSONB-as-blob pattern.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireSessionAccess } from '@/lib/auth/requireCoach';
import { rematerializeIfActive } from '@/lib/programs/materialize';
import { sanitizeExercises } from '@/lib/programs/sanitizeExercises';

export const dynamic = 'force-dynamic';

export async function PATCH(req, context) {
  const params = await context.params;
  const sessionId = params?.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
  }

  const access = await requireSessionAccess(sessionId);
  if (access.error) return access.error;


  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const patch = {};
  if (typeof body?.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Session name cannot be empty.' }, { status: 400 });
    }
    patch.name = trimmed;
  }
  if (Number.isFinite(Number(body?.week_number)) && Number(body.week_number) > 0) {
    patch.week_number = Math.floor(Number(body.week_number));
  }
  if (Number.isFinite(Number(body?.day_index)) && Number(body.day_index) > 0) {
    patch.day_index = Math.floor(Number(body.day_index));
  }
  if (typeof body?.notes === 'string' || body?.notes === null) {
    patch.notes = body.notes ? body.notes.trim() || null : null;
  }
  if (Array.isArray(body?.exercises)) {
    patch.exercises = sanitizeExercises(body.exercises);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data: session, error } = await supabase
    .from('program_sessions')
    .update(patch)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('[session] update failed', error);
    return NextResponse.json({ error: 'Could not update session.' }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  // If this session belongs to an ACTIVE programme, push the edit straight to
  // the athlete & PAX — no silent stale-plan gap between edit and re-activate.
  const remat = await rematerializeIfActive(session.program_id);

  return NextResponse.json({ session, livePlanUpdated: remat.active, liveRows: remat.rows });
}

export async function DELETE(_req, context) {
  const params = await context.params;
  const sessionId = params?.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
  }

  const access = await requireSessionAccess(sessionId);
  if (access.error) return access.error;

  // Grab the parent programme before the row disappears, so we can push the
  // deletion to the live plan if that programme is active.
  const { data: existing } = await supabase
    .from('program_sessions')
    .select('program_id')
    .eq('id', sessionId)
    .maybeSingle();

  const { error } = await supabase
    .from('program_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('[session] delete failed', error);
    return NextResponse.json({ error: 'Could not delete session.' }, { status: 500 });
  }

  const remat = await rematerializeIfActive(existing?.program_id);

  return NextResponse.json({ ok: true, livePlanUpdated: remat.active, liveRows: remat.rows });
}

// sanitizeExercises now lives in lib/programs/sanitizeExercises.js (shared
// with the session-create route so duplicated sessions keep their exercises).
