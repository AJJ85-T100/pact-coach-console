/**
 * /api/client-schedule
 *
 * POST { clientId, days: ["Mon","Thu", ...] } — set the weekdays the coach
 * regularly sees this client, so the briefs roster can group by day.
 * Requires: clients.session_days jsonb column.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const VALID = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function POST(req) {
  noStore();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId : null;
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }

  const days = Array.isArray(body.days)
    ? VALID.filter((d) => body.days.includes(d)) // dedupe + keep canonical week order
    : [];

  const { data, error } = await supabase
    .from('clients')
    .update({ session_days: days })
    .eq('id', clientId)
    .select('id, session_days')
    .maybeSingle();

  if (error) {
    console.error('[client-schedule] update failed', error);
    return NextResponse.json({ error: 'Could not save schedule.' }, { status: 500 });
  }
  return NextResponse.json({ client: data }, { headers: { 'Cache-Control': 'no-store' } });
}
