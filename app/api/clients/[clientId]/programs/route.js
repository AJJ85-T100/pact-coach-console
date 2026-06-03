/**
 * /api/clients/[clientId]/programs
 *
 * POST  — Create a new program for a client. pt_id is derived from the
 *         client's own pt_id, not passed in the body.
 * GET   — List all programs for a client, bundled with minimal client info
 *         so the PT-side list page only needs one fetch.
 *
 * Uses the shared no-cache admin client from lib/supabase/admin.js so
 * fresh data lands on every GET (see Wave 2a debug notes).
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req, context) {
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

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Program name is required.' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, pt_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr || !client) {
    console.error('[programs] client lookup failed', clientErr);
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const insert = {
    client_id: client.id,
    pt_id: client.pt_id,
    name,
    status: 'draft',
    start_date: body?.start_date || null,
    weeks: Number.isFinite(body?.weeks) && body.weeks > 0 ? Math.floor(body.weeks) : null,
    notes: typeof body?.notes === 'string' ? body.notes : null,
  };

  const { data: program, error: insertErr } = await supabase
    .from('programs')
    .insert(insert)
    .select()
    .single();

  if (insertErr) {
    console.error('[programs] insert failed', insertErr);
    return NextResponse.json({ error: 'Could not create program.' }, { status: 500 });
  }

  return NextResponse.json({ program });
}

export async function GET(_req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId;

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }

  const [{ data: client, error: clientErr }, { data: programs, error: programsErr }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('programs')
      .select('id, name, status, start_date, weeks, notes, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ]);

  if (clientErr || !client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }
  if (programsErr) {
    console.error('[programs] list failed', programsErr);
    return NextResponse.json({ error: 'Could not load programs.' }, { status: 500 });
  }

  return NextResponse.json(
    {
      client,
      programs: programs || [],
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}
