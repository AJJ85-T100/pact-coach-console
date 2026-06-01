/**
 * POST /api/terra/connect
 *
 * Body: { clientId: string, provider: string }
 * Returns: { authUrl: string }
 *
 * The picker UI calls this, then redirects the user to the returned URL.
 * Terra hosts the OAuth handshake; on success/failure, Terra redirects the
 * user back to our /onboard/connected (success) or /onboard/connect-failed
 * (failure) routes.
 *
 * Auth model for V1 pilot: client must exist in Supabase. That's the only
 * gate. Tightening this further (matching against a valid invite token, or
 * checking the user is signed in as the coach who owns the client) is a
 * post-pilot hardening item.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAuthURL, isValidProvider } from '../../../../lib/terra';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // server-only key
);

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { clientId, provider } = body || {};

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }
  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 });
  }

  // Verify the client exists. Don't leak whether the lookup matched — just
  // 404 on miss so we don't act as an oracle for valid client IDs.
  const { data: client, error: lookupErr } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();

  if (lookupErr || !client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_ORIGIN || '';
  const successUrl = `${origin}/onboard/connected?clientId=${clientId}&provider=${provider}`;
  const failureUrl = `${origin}/onboard/connect-failed?clientId=${clientId}&provider=${provider}`;

  try {
    const authUrl = await generateAuthURL(clientId, provider, successUrl, failureUrl);
    return NextResponse.json({ authUrl });
  } catch (err) {
    console.error('[terra/connect] generateAuthURL failed', err);
    return NextResponse.json(
      { error: 'Failed to start connection. Try again in a moment.' },
      { status: 502 },
    );
  }
}
