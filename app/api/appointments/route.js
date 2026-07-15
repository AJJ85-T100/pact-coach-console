/**
 * /api/appointments
 *
 * GET    ?clientId=...  — a client's appointments (soonest first) + the next upcoming one
 * POST   { clientId, scheduledAt, note? }  — book the next session
 * DELETE ?id=…          — cancel a scheduled appointment
 *
 * This is how the system knows a session is coming: the brief panel reads the
 * next appointment. Requires the `appointments` table.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  noStore();
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;


  const { data, error } = await supabase
    .from('appointments')
    .select('id, scheduled_at, note, status')
    .eq('client_id', clientId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[appointments] list failed', error);
    return NextResponse.json({ error: 'Could not load appointments.' }, { status: 500 });
  }

  const now = Date.now();
  const list = data || [];
  const next = list.find((a) => new Date(a.scheduled_at).getTime() >= now) || null;
  return NextResponse.json({ appointments: list, next }, { headers: { 'Cache-Control': 'no-store' } });
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
  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;


  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!when || isNaN(when.getTime())) {
    return NextResponse.json({ error: 'A valid date/time is required.' }, { status: 400 });
  }
  const note = body.note && typeof body.note === 'string' ? body.note.trim() || null : null;

  const { data, error } = await supabase
    .from('appointments')
    .insert({ client_id: clientId, scheduled_at: when.toISOString(), note, status: 'scheduled' })
    .select('id, scheduled_at, note, status')
    .maybeSingle();

  if (error) {
    console.error('[appointments] insert failed', error);
    return NextResponse.json({ error: 'Could not schedule appointment.' }, { status: 500 });
  }
  return NextResponse.json({ appointment: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req) {
  noStore();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  // Ownership chain: appointment -> client -> this coach.
  const { data: appt } = await supabase
    .from('appointments').select('client_id').eq('id', id).maybeSingle();
  if (!appt) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const access = await requireClientAccess(appt.client_id);
  if (access.error) return access.error;

  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
  if (error) {
    console.error('[appointments] cancel failed', error);
    return NextResponse.json({ error: 'Could not cancel.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
