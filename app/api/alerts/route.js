/** GET /api/alerts — is this coach's Telegram linked for escalation alerts (engine, as the coach). */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/alerts');
  return NextResponse.json(json, { status });
}
