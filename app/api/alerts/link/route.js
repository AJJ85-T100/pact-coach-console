/**
 * /api/alerts/link — escalation alerts on Telegram, via the engine as the coach.
 *   POST   → { url }  one-time t.me link that ties the coach's Telegram (503 if not configured)
 *   DELETE → { ok, telegramLinked: false }
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { status, json } = await engineFetch('/v1/coach/alerts/link', { method: 'POST', body: '{}' });
  return NextResponse.json(json, { status });
}

export async function DELETE() {
  const { status, json } = await engineFetch('/v1/coach/alerts/link', { method: 'DELETE' });
  return NextResponse.json(json, { status });
}
