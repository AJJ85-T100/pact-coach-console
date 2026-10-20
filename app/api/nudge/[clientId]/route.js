/**
 * POST /api/nudge/[clientId]   Body: { brief }
 *
 * The coach's manual nudge: verifies the signed-in coach owns this client,
 * then hands the brief to the engine (as the coach), which writes the
 * message with PAX in the coach's voice, sends it by push or Telegram and
 * keeps it in the thread. Returns { sent }: the exact message that went out.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function POST(req, context) {
  noStore();
  const params = await context.params;
  const url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean).pop();
  const clientId = params?.clientId || (seg && seg !== 'nudge' ? decodeURIComponent(seg) : null);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  const body = await req.json().catch(() => ({}));
  const brief = (body.brief || '').toString().trim().slice(0, 500);
  if (!brief) return NextResponse.json({ error: 'Write a brief first.' }, { status: 400 });

  const { status, json } = await engineFetch(`/v1/coach/nudge/${encodeURIComponent(clientId)}`, {
    method: 'POST',
    body: JSON.stringify({ brief }),
  });
  if (status !== 200) {
    return NextResponse.json({ error: json?.error || 'PAX could not send the nudge.' }, { status: status === 409 ? 409 : 502 });
  }
  if (!json.ok) {
    return NextResponse.json({ error: 'PAX wrote it, but it could not be delivered: they have no app notifications or Telegram connected.', sent: json.sent }, { status: 409 });
  }
  return NextResponse.json({ ok: true, sent: json.sent });
}
