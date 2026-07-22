/**
 * /api/notes
 *
 * GET  — ?clientId=… → that athlete's recent notes; without clientId → the
 *        coach's roster (for the selector).
 * POST — { clientId, body, urgent } → create a note. Athlete app shows the
 *        latest three on the "Notes from your coach" card.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireCoach } from '@/lib/auth/requireCoach';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';
import { relayToAthlete } from '@/lib/bot/relay';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  noStore();
  const clientId = new URL(req.url).searchParams.get('clientId');

  if (!clientId) {
    const coach = await requireCoach();
    if (coach.error) return coach.error;
    const { data: clients = [] } = await coach.service
      .from('clients').select('id, name').eq('pt_id', coach.pt.id).order('name');
    return NextResponse.json({ clients });
  }

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const { data: notes = [] } = await coach.service
    .from('coach_notes')
    .select('id, body, urgent, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20);
  return NextResponse.json({ notes });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const clientId = body?.clientId;
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 1000) : '';
  if (!clientId || !text) return NextResponse.json({ error: 'clientId and body required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const { data: note, error } = await coach.service
    .from('coach_notes')
    .insert({ client_id: clientId, pt_id: coach.pt.id, body: text, urgent: !!body?.urgent })
    .select()
    .single();
  if (error) {
    console.error('[notes] insert failed', error);
    return NextResponse.json({ error: 'Could not save the note.' }, { status: 500 });
  }

  // Close the loop: PAX passes the note on to the athlete over WhatsApp.
  // Non-fatal — the note is saved (and on the athlete app card) regardless.
  const relayed = await relayToAthlete(clientId, 'coach_note', {
    note: text,
    urgent: !!body?.urgent,
  });

  return NextResponse.json({ note, relayed });
}
