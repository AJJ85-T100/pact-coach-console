/**
 * /api/calendar — the signed-in coach's Google Calendar connection.
 *
 * GET    — { configured, connected, email, connectUrl }
 *          connectUrl is minted by the bot (it signs the OAuth state);
 *          null when Google credentials aren't configured platform-side.
 * DELETE — disconnect (removes the stored tokens via the bot).
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireCoach } from '@/lib/auth/requireCoach';
import { coachConnectUrl, coachCalendarStatus } from '@/lib/bot/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const origin = new URL(req.url).origin;
  const returnTo = `${origin}/dashboard/settings`;

  const [status, connectUrl] = await Promise.all([
    coachCalendarStatus(coach.pt.id),
    coachConnectUrl(coach.pt.id, returnTo),
  ]);

  return NextResponse.json({
    configured: !!(status.configured || connectUrl),
    connected: !!status.connected,
    email: status.email || null,
    connectUrl,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE() {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  // Tokens live in calendar_connections (service-role only) — remove directly.
  const { error } = await coach.service
    .from('calendar_connections')
    .delete()
    .eq('owner_type', 'coach')
    .eq('owner_id', coach.pt.id);

  if (error) {
    console.error('[calendar] disconnect failed', error);
    return NextResponse.json({ error: 'Could not disconnect.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
