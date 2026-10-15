/** PUT /api/roster-v2/[id] { onEngine } — move an athlete onto (or off) the V2 engine. */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function PUT(req, { params }) {
  const body = await req.json().catch(() => null);
  const { status, json } = await engineFetch(`/v1/coach/roster/${encodeURIComponent(params.id)}`, { method: 'PUT', body: JSON.stringify({ onEngine: !!body?.onEngine }) });
  return NextResponse.json(json, { status });
}
