/**
 * /api/programs/[programId]/sessions
 *
 * POST — Add a session to a program. Initial exercises array is empty;
 *        exercises are added via PATCH on /api/program-sessions/[sessionId].
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function POST(req, context) {
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

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Session name required.' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'Session name too long.' }, { status: 400 });
  }

  // Verify program exists
  const { data: program, error: programErr } = await supabase
    .from('programs')
    .select('id')
    .eq('id', programId)
    .maybeSingle();

  if (programErr || !program) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }

  const insert = {
    program_id: programId,
    week_number: Number.isFinite(Number(body?.week_number)) && Number(body.week_number) > 0
      ? Math.floor(Number(body.week_number))
      : 1,
    day_index: Number.isFinite(Number(body?.day_index)) && Number(body.day_index) > 0
      ? Math.floor(Number(body.day_index))
      : 1,
    name,
    exercises: [],
    notes: typeof body?.notes === 'string' ? body.notes.trim() || null : null,
  };

  const { data: session, error: insertErr } = await supabase
    .from('program_sessions')
    .insert(insert)
    .select()
    .single();

  if (insertErr) {
    console.error('[sessions] insert failed', insertErr);
    return NextResponse.json({ error: 'Could not create session.' }, { status: 500 });
  }

  return NextResponse.json({ session });
}
