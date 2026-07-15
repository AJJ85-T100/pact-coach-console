/**
 * lib/auth/requireClientAccess.js
 *
 * Ownership guard for coach-scoped API routes. Resolves the signed-in
 * coach from the session cookie (same chain as the dashboard layout:
 * auth.getUser() → personal_trainers by auth_user_id), then verifies the
 * requested client belongs to that coach.
 *
 * Usage in a route handler:
 *
 *   const access = await requireClientAccess(clientId);
 *   if (access.error) return access.error;        // NextResponse, ready to return
 *   const { client, pt } = access;                // safe to proceed
 *
 * Returns:
 *   { error: NextResponse }                       401 / 403 / 404 / 500
 *   { client: {id, name, pt_id}, pt: {id, name} } on success
 *
 * Server-side only — imports the cookie client and the service client.
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function requireClientAccess(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    return { error: NextResponse.json({ error: 'clientId required.' }, { status: 400 }) };
  }

  // 1. Who is signed in? (cookie-scoped client, same as the dashboard layout)
  const supabase = createClient();
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }

  // 2. Which coach is that? (service client, manual scoping — same as layout)
  const service = createServiceClient();
  const { data: pt, error: ptErr } = await service
    .from('personal_trainers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (ptErr) {
    console.error('[auth] pt lookup failed', ptErr);
    return { error: NextResponse.json({ error: 'Could not resolve coach.' }, { status: 500 }) };
  }
  if (!pt) {
    return { error: NextResponse.json({ error: 'No coach profile for this account.' }, { status: 403 }) };
  }

  // 3. Does the requested client belong to them?
  const { data: client, error: clientErr } = await service
    .from('clients')
    .select('id, name, pt_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr) {
    console.error('[auth] client lookup failed', clientErr);
    return { error: NextResponse.json({ error: 'Could not load client.' }, { status: 500 }) };
  }
  if (!client) {
    return { error: NextResponse.json({ error: 'Client not found.' }, { status: 404 }) };
  }
  if (client.pt_id !== pt.id) {
    // Deliberately 404-shaped in message but honest in status: don't leak
    // whether the id exists to a coach who doesn't own it.
    return { error: NextResponse.json({ error: 'Client not found.' }, { status: 403 }) };
  }

  return { client, pt };
}
