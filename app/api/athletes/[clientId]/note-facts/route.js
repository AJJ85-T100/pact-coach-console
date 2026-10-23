/**
 * POST /api/athletes/[clientId]/note-facts { text } — the lasting facts PAX
 * would take from a session note, for the coach to keep or bin. Saves
 * nothing. Needs the athlete's consent (the engine checks and records the call).
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.slice(0, 2000) : '';
  if (!text.trim()) return NextResponse.json({ facts: [], skipped: 'too_short' });
  const { status, json } = await engineFetch(`/v1/coach/athletes/${encodeURIComponent(params.clientId)}/note-facts`, { method: 'POST', body: JSON.stringify({ text }) });
  return NextResponse.json(json, { status });
}
