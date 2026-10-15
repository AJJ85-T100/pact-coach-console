/**
 * POST /api/needs-you/[id]
 *   { kind: 'draft', action: 'approve' | 'edit' | 'reject', text? }
 *   { kind: 'escalation', action: 'handled' }
 *   { kind: 'consent' }   send the athlete their consent link (id = client id)
 * Proxies to the engine as the signed-in coach; the engine checks ownership.
 */
import { NextResponse } from 'next/server';
import { engineFetch } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const body = await req.json().catch(() => null);
  if (!body || !['draft', 'escalation', 'consent'].includes(body.kind)) {
    return NextResponse.json({ error: 'kind must be draft, escalation or consent' }, { status: 400 });
  }
  const id = encodeURIComponent(params.id);
  const path =
    body.kind === 'draft' ? `/v1/coach/drafts/${id}` : body.kind === 'escalation' ? `/v1/coach/escalations/${id}` : `/v1/coach/consent-link/${id}`;
  const payload = body.kind === 'draft' ? { action: body.action, text: body.text } : body.kind === 'escalation' ? { action: 'handled' } : {};
  const { status, json } = await engineFetch(path, { method: 'POST', body: JSON.stringify(payload) });
  return NextResponse.json(json, { status });
}
