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

export const dynamic = 'force-dynamic';

export async function PATCH(req, context) {
  const params = await context.params;
  const sessionId = params?.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
  }

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

  return NextResponse.json({ session });
}

export async function DELETE(_req, context) {
  const params = await context.params;
  const sessionId = params?.sessionId;

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('program_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('[session] delete failed', error);
    return NextResponse.json({ error: 'Could not delete session.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function sanitizeExercises(exercises) {
  return exercises
    .filter((e) => e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim())
    .map((e, i) => {
      const sets       = toIntOrNull(e.sets, 1, 20);
      const repsMin    = toIntOrNull(e.reps_min, 1, 100);
      const repsMax    = toIntOrNull(e.reps_max, 1, 100);
      const rpe        = toFloatOrNull(e.rpe, 1, 10);
      const restSecs   = toIntOrNull(e.rest_seconds, 0, 1800);

      return {
        id: typeof e.id === 'string' && e.id ? e.id : `ex-${Date.now()}-${i}`,
        name: e.name.trim(),
        sets,
        reps_min: repsMin,
        reps_max: repsMax,
        weight: typeof e.weight === 'string' ? e.weight.trim() || null : null,
        rpe,
        rest_seconds: restSecs,
        tempo: typeof e.tempo === 'string' ? e.tempo.trim() || null : null,
        notes: typeof e.notes === 'string' ? e.notes.trim() || null : null,
        equipment_needed: Array.isArray(e.equipment_needed)
          ? e.equipment_needed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
          : [],
      };
    });
}

function toIntOrNull(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toFloatOrNull(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
