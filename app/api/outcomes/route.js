/** GET /api/outcomes — what happened after each kind of PAX message (engine, as the coach). */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/outcomes');
  return NextResponse.json(json, { status });
}
