/**
 * /api/autonomy — which kinds of PAX message the coach lets it send on its
 * own, via the engine as the signed-in coach (engine writes and checks).
 *   GET  → { days, angles: [{ angle, label, approved, approvedUnchanged, edited, rejected, auto, suggest, locked }] }
 *   POST { angle, auto } → { ok, autoAngles } | 400 (locked/unknown) | 503 (migration not run)
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/autonomy');
  return NextResponse.json(json, { status });
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.angle !== 'string' || !body.angle || typeof body.auto !== 'boolean') {
    return NextResponse.json({ error: 'angle (string) and auto (boolean) required' }, { status: 400 });
  }
  const { status, json } = await engineFetch('/v1/coach/autonomy', {
    method: 'POST',
    body: JSON.stringify({ angle: body.angle, auto: body.auto }),
  });
  return NextResponse.json(json, { status });
}
