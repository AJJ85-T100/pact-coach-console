/**
 * /api/settings/mcp-key — the coach's key for connecting Claude (ticket 6.1),
 * via the engine as the signed-in coach. GET status, POST a new key (shown
 * once), DELETE revoke. The key itself is never stored here.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { status, json } = await engineFetch('/v1/coach/mcp-key');
  return NextResponse.json(json, { status });
}

export async function POST() {
  const { status, json } = await engineFetch('/v1/coach/mcp-key', { method: 'POST' });
  return NextResponse.json(json, { status, headers: { 'cache-control': 'no-store' } });
}

export async function DELETE() {
  const { status, json } = await engineFetch('/v1/coach/mcp-key', { method: 'DELETE' });
  return NextResponse.json(json, { status });
}
