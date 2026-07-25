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
 * ⚠️ AUTH (security review, M1). This used to gate on nothing but "the
 * client row exists" — a deliberate V1 shortcut that stopped being safe the
 * moment the platform went multi-coach. Client UUIDs are not secret (this
 * very route puts one in a redirect URL handed to Terra), so anyone could
 * mint a PACT-branded Terra OAuth URL bound to a real athlete, authorise
 * THEIR OWN Oura/Garmin against it, and have a stranger's biometrics land on
 * that athlete's record for the coach and PAX to coach against.
 *
 * Now requires a signed-in coach who owns the client, or the athlete's own
 * invite token bound to that same client.
 *
 * Note: the athlete app's Settings → Connect a device (bot /terra/session,
 * authenticated with the athlete's Supabase JWT) superseded this route in
 * Session 14. The /onboard/connect page that calls it was never wired into
 * the live wizard — it is a standalone prototype. Kept and secured rather
 * than deleted, but it is a retirement candidate.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAuthURL, isValidProvider } from '../../../../lib/terra';
import { requireClientAccess } from '../../../../lib/auth/requireClientAccess';
import { tokenMatchesClient } from '../../../../lib/auth/requireCoach';

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

  // Coach session that owns this client, or the athlete's own invite token.
  const access = await requireClientAccess(clientId);
  if (access.error) {
    const t = new URL(req.url).searchParams.get('token') || body?.token;
    if (!(t && await tokenMatchesClient(clientId, t))) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    }
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

  // Server-side origin only. Taking this from the request's Origin header
  // let an attacker choose where the athlete lands after authorising their
  // wearable — with a real Terra consent screen in between.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXT_PUBLIC_APP_ORIGIN
    || '').replace(/\/$/, '');
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
