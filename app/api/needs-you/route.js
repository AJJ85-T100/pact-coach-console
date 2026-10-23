/**
 * GET /api/needs-you — the coach's queue from the V2 engine: open escalations
 * (ranked by urgency), athletes going quiet (`quiet`, the Cortex's flag), PAX
 * drafts awaiting approval, drifting athletes and consent needed.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/needs-you');
  return NextResponse.json(json, { status });
}
