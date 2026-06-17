/**
 * /api/programs/[programId]/sessions
 *
 * GET  — List the sessions for a programme (ordered week_number, day_index).
 * POST — Create a new session under the programme.
 *
 * Uses the shared no-cache admin client (lib/supabase/admin.js) so reads
 * after a write don't return stale data.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };

// ============================================================================
// GET — list the programme's sessions
// ============================================================================
export async function GET(_req, context) {
  noStore();
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('program_sessions')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true })
    .order('day_index', { ascending: true });

  if (error) {
    console.error('[sessions] list failed', error);
    return NextResponse.json({ error: 'Could not load sessions.' }, { status: 500 });
  }

  return NextResponse.json({ sessions: data || [] }, { headers: noStoreHeaders });
}

// ============================================================================
// POST — create a session under the programme
// ============================================================================
export async function POST(req, context) {
  noStore();
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Session name is required.' }, { status: 400 });
  }

  const week = Number(body.week_number);
  if (!Number.isFinite(week) || week < 1 || week > 52) {
    return NextResponse.json({ error: 'Week must be between 1 and 52.' }, { status: 400 });
  }

  const day = Number(body.day_index);
  if (!Number.isFinite(day) || day < 1 || day > 7) {
    return NextResponse.json({ error: 'Day must be between 1 and 7.' }, { status: 400 });
  }

  const notes = body.notes ? String(body.notes).trim() || null : null;

  // Confirm the programme exists so we don't create orphan sessions.
  const { data: program, error: progErr } = await supabase
    .from('programs')
    .select('id')
    .eq('id', programId)
    .maybeSingle();

  if (progErr) {
    console.error('[sessions] program lookup failed', progErr);
    return NextResponse.json({ error: 'Could not create session.' }, { status: 500 });
  }
  if (!program) {
    return NextResponse.json({ error: 'Programme not found.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('program_sessions')
    .insert({
      program_id: programId,
      name,
      week_number: Math.floor(week),
      day_index: Math.floor(day),
      notes,
      exercises: [],
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[sessions] create failed', error);
    return NextResponse.json({ error: 'Could not create session.' }, { status: 500 });
  }

  return NextResponse.json({ session: data }, { status: 201, headers: noStoreHeaders });
}
