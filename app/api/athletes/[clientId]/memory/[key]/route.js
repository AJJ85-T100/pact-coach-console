/** DELETE /api/athletes/[clientId]/memory/[key] — remove one fact PAX holds, via the engine. */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function DELETE(_req, { params }) {
  const { status, json } = await engineFetch(
    `/v1/coach/athletes/${encodeURIComponent(params.clientId)}/memory/${encodeURIComponent(params.key)}`,
    { method: 'DELETE' },
  );
  return NextResponse.json(json, { status });
}
