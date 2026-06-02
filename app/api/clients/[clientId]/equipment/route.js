/**
 * /api/clients/[clientId]/equipment
 *
 * POST  — Replace the client's equipment list with the supplied array.
 * GET   — Read the client's current equipment list.
 *
 * V1 is replace-semantics (single photo, single confirmation). When
 * multi-photo support lands, the client-side will dedupe across photos
 * before sending so this endpoint stays simple.
 *
 * Auth model is the same as /api/terra/connect for now — client must exist.
 * Tightening (token-gated, coach-owned check) is a post-pilot hardening item.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Keep this shape aligned with what /api/gym-scan returns so the round-trip
// is clean and the schema stays a single source of truth.
function sanitizeEquipmentList(raw) {
  if (!Array.isArray(raw)) return null;

  return raw
    .filter(item => item && typeof item.name === 'string' && item.name.trim().length > 0)
    .map(item => ({
      name: String(item.name).trim().slice(0, 200),
      quantity:
        Number.isFinite(item.quantity) && item.quantity >= 1
          ? Math.floor(item.quantity)
          : 1,
      confidence: ['high', 'medium', 'low'].includes(item.confidence)
        ? item.confidence
        : 'medium',
    }));
}

export async function POST(req, context) {
  // `await` works whether params is a Promise (Next 15) or a plain object (Next 14)
  const params = await context.params;
  const clientId = params?.clientId;

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const sanitized = sanitizeEquipmentList(body?.equipment);
  if (sanitized === null) {
    return NextResponse.json({ error: 'equipment array required.' }, { status: 400 });
  }

  // Verify the client exists — 404 on miss so we don't act as an oracle for valid IDs.
  const { data: client, error: lookupErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();

  if (lookupErr || !client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from('clients')
    .update({ equipment_list: sanitized })
    .eq('id', clientId);

  if (updateErr) {
    console.error('[clients/equipment] update failed', updateErr);
    return NextResponse.json({ error: 'Save failed. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ equipment: sanitized });
}

export async function GET(_req, context) {
  const params = await context.params;
  const clientId = params?.clientId;

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('clients')
    .select('equipment_list')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  return NextResponse.json({ equipment: data.equipment_list || [] });
}
