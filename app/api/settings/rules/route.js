/**
 * /api/settings/rules — the coach's boundaries for PAX (coach_rules), via the
 * engine as the signed-in coach. GET reads, PUT saves.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/rules');
  return NextResponse.json(json, { status });
}

export async function PUT(req) {
  const body = await req.json().catch(() => null);
  const { status, json } = await engineFetch('/v1/coach/rules', { method: 'PUT', body: JSON.stringify(body) });
  return NextResponse.json(json, { status });
}
