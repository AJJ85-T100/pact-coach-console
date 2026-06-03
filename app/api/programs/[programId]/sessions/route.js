/**
 * /api/programs/[programId]
 *
 * GET — Load a program with all its sessions, plus minimal client info
 *       for the editor page breadcrumb.
 *
 * Sessions are sorted by week_number then day_index so the editor renders
 * them in training order without needing to sort client-side.
 *
 * Uses the shared no-cache admin client (lib/supabase/admin.js) so the
 * fetch cache doesn't return stale data after PATCH writes.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req, context) {
  noStore();
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

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', programRes.data.client_id)
    .maybeSingle();

  return NextResponse.json(
    {
      program: programRes.data,
      sessions: sessionsRes.data || [],
      client: client || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}
