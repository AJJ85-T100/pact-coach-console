/**
 * /api/athletes/[clientId]/plan — the athlete's phase (cut/bulk/maintain/recomp)
 * and this month's focus habit, via the engine as the signed-in coach.
 * GET reads, PUT saves. The engine checks the athlete is on this coach's roster.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

const path = (id) => `/v1/coach/athletes/${encodeURIComponent(id)}/plan`;

export async function GET(_req, { params }) {
  const { status, json } = await engineFetch(path(params.clientId));
  return NextResponse.json(json, { status });
}

export async function PUT(req, { params }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { status, json } = await engineFetch(path(params.clientId), { method: 'PUT', body: JSON.stringify(body) });
  return NextResponse.json(json, { status });
}
