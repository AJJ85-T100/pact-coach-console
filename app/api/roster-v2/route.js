/** GET /api/roster-v2 — each athlete's PACT V2 status, from the engine as the coach. */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/roster');
  return NextResponse.json(json, { status });
}
