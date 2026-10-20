/**
 * /api/calendar — the signed-in coach's Google Calendar connection.
 *
 * GET    — { configured, connected, email, connectUrl }
 *          connectUrl is minted by the engine (it signs the OAuth ticket);
 *          null when Google credentials aren't configured platform-side.
 * DELETE — disconnect, via the engine.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireCoach } from '@/lib/auth/requireCoach';
import { coachConnectUrl, coachCalendarStatus, disconnectCoachCalendar } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const origin = new URL(req.url).origin;
  const returnTo = `${origin}/dashboard/settings`;

  const [status, connectUrl] = await Promise.all([
    coachCalendarStatus(),
    coachConnectUrl(returnTo),
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

  if (!(await disconnectCoachCalendar())) {
    return NextResponse.json({ error: 'Could not disconnect.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
