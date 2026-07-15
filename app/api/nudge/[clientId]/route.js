/**
 * POST /api/nudge/[clientId]   Body: { brief }
 *
 * The coach's manual nudge: verifies the signed-in coach owns this client,
 * then hands the brief to the bot, which composes and sends the message in
 * the coach's calibrated voice and logs it to the conversation thread.
 *
 * Env: BOT_URL (the bot's public Railway URL) and NUDGE_SECRET (must match
 * the bot's). Returns { sent } — the exact message that went out.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

export async function POST(req, context) {
  noStore();
  const params = await context.params;
  const url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean).pop();
  const clientId = params?.clientId || (seg && seg !== 'nudge' ? decodeURIComponent(seg) : null);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  if (!process.env.BOT_URL || !process.env.NUDGE_SECRET) {
    return NextResponse.json({ error: 'Nudges are not configured on the server (BOT_URL / NUDGE_SECRET).' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const brief = (body.brief || '').toString().trim().slice(0, 500);
  if (!brief) return NextResponse.json({ error: 'Write a brief first.' }, { status: 400 });

  try {
    const res = await fetch(`${process.env.BOT_URL.replace(/\/$/, '')}/nudge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nudge-secret': process.env.NUDGE_SECRET,
      },
      body: JSON.stringify({ client_id: clientId, brief }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: j.error || 'The bot could not send the nudge.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: j.sent });
  } catch (e) {
    console.error('[nudge] bot call failed', e);
    return NextResponse.json({ error: 'Could not reach the messaging service.' }, { status: 502 });
  }
}
