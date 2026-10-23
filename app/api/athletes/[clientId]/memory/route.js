/**
 * /api/athletes/[clientId]/memory — what PAX knows about this athlete, via the
 * engine as the signed-in coach. GET lists both tiers (set by you; picked up
 * from their messages); POST { key?, value } adds or confirms a fact.
 * The engine checks the athlete is on this coach's roster.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

const path = (id) => `/v1/coach/athletes/${encodeURIComponent(id)}/memory`;

export async function GET(_req, { params }) {
  const { status, json } = await engineFetch(path(params.clientId));
  return NextResponse.json(json, { status });
}

export async function POST(req, { params }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { status, json } = await engineFetch(path(params.clientId), { method: 'POST', body: JSON.stringify({ key: body.key, value: body.value }) });
  return NextResponse.json(json, { status });
}
