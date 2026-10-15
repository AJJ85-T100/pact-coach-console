/**
 * POST /api/needs-you/[id]
 *   { kind: 'draft', action: 'approve' | 'edit' | 'reject', text? }
 *   { kind: 'escalation', action: 'handled' }
 * Proxies to the engine as the signed-in coach; the engine checks ownership.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const body = await req.json().catch(() => null);
  if (!body || !['draft', 'escalation'].includes(body.kind)) {
    return NextResponse.json({ error: 'kind must be draft or escalation' }, { status: 400 });
  }
  const id = encodeURIComponent(params.id);
  const path = body.kind === 'draft' ? `/v1/coach/drafts/${id}` : `/v1/coach/escalations/${id}`;
  const payload = body.kind === 'draft' ? { action: body.action, text: body.text } : { action: 'handled' };
  const { status, json } = await engineFetch(path, { method: 'POST', body: JSON.stringify(payload) });
  return NextResponse.json(json, { status });
}
