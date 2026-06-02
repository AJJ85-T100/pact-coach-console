/**
 * /api/programs/[programId]
 *
 * GET — Load a program with all its sessions, plus minimal client info
 *       for the editor page breadcrumb.
 *
 * Sessions are sorted by week_number then day_index so the editor renders
 * them in training order without needing to sort client-side.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function GET(_req, context) {
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  const [programRes, sessionsRes] = await Promise.all([
    supabase
      .from('programs')
      .select('*')
      .eq('id', programId)
      .maybeSingle(),
    supabase
      .from('program_sessions')
      .select('*')
      .eq('program_id', programId)
      .order('week_number', { ascending: true })
      .order('day_index', { ascending: true }),
  ]);

  if (programRes.error) {
    console.error('[program] load failed', programRes.error);
    return NextResponse.json({ error: 'Could not load program.' }, { status: 500 });
  }
  if (!programRes.data) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }
  if (sessionsRes.error) {
    console.error('[sessions] load failed', sessionsRes.error);
    return NextResponse.json({ error: 'Could not load sessions.' }, { status: 500 });
  }

  // Pull minimal client info for breadcrumb
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', programRes.data.client_id)
    .maybeSingle();

  return NextResponse.json({
    program: programRes.data,
    sessions: sessionsRes.data || [],
    client: client || null,
  });
}
