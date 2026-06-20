/**
 * /api/coach-meetings
 *
 * POST — log that the coach has met a client now. Writes a coach_meetings row,
 * which becomes the new "since you last met" anchor for that client's brief.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  noStore();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('coach_meetings')
    .select('id, met_at, note')
    .eq('client_id', clientId)
    .order('met_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[coach-meetings] list failed', error);
    return NextResponse.json({ error: 'Could not load meetings.' }, { status: 500 });
  }
  return NextResponse.json({ meetings: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  noStore();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId : null;
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }
  const note = body.note && typeof body.note === 'string' ? body.note.trim() || null : null;

  const { data, error } = await supabase
    .from('coach_meetings')
    .insert({ client_id: clientId, note })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[coach-meetings] insert failed', error);
    return NextResponse.json({ error: 'Could not log meeting.' }, { status: 500 });
  }

  return NextResponse.json({ meeting: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
