/** GET /api/retention — still active in month 1 / 2 / 3, everyone who started counted (engine, as the coach). */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/retention');
  return NextResponse.json(json, { status });
}
