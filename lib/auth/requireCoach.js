/**
 * lib/auth/requireCoach.js
 *
 * Companions to requireClientAccess for routes that aren't client-scoped:
 *
 *   requireCoach()                 — any signed-in coach (coach tooling).
 *   requireProgramAccess(id)      — programme → client → must be this coach's.
 *   requireSessionAccess(id)      — session → programme → client → this coach's.
 *   tokenMatchesClient(clientId,t) — invite token belonging to this client
 *                                    (the athlete's credential post-onboarding).
 *   tokenValidOrUsed(t)           — any real invite token (anti-abuse gate for
 *                                    athlete-invoked endpoints like gym-scan).
 *
 * Server-side only.
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function requireCoach() {
  const supabase = createClient();
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }
  const service = createServiceClient();
  const { data: pt, error } = await service
    .from('personal_trainers').select('id, name')
    .eq('auth_user_id', user.id).maybeSingle();
  if (error) {
    console.error('[auth] pt lookup failed', error);
    return { error: NextResponse.json({ error: 'Could not resolve coach.' }, { status: 500 }) };
  }
  if (!pt) {
    return { error: NextResponse.json({ error: 'No coach profile for this account.' }, { status: 403 }) };
  }
  return { pt, service };
}

async function chainToCoach(service, clientId, pt) {
  const { data: client } = await service
    .from('clients').select('id, name, pt_id').eq('id', clientId).maybeSingle();
  if (!client || client.pt_id !== pt.id) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: client ? 403 : 404 }) };
  }
  return { client };
}

export async function requireProgramAccess(programId) {
  if (!programId || typeof programId !== 'string') {
    return { error: NextResponse.json({ error: 'programId required.' }, { status: 400 }) };
  }
  const coach = await requireCoach();
  if (coach.error) return coach;

  const { data: program } = await coach.service
    .from('programs').select('id, client_id').eq('id', programId).maybeSingle();
  if (!program) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };

  const chain = await chainToCoach(coach.service, program.client_id, coach.pt);
  if (chain.error) return chain;
  return { program, client: chain.client, pt: coach.pt, service: coach.service };
}

export async function requireSessionAccess(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { error: NextResponse.json({ error: 'sessionId required.' }, { status: 400 }) };
  }
  const coach = await requireCoach();
  if (coach.error) return coach;

  const { data: session } = await coach.service
    .from('program_sessions').select('id, program_id').eq('id', sessionId).maybeSingle();
  if (!session) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };

  const { data: program } = await coach.service
    .from('programs').select('id, client_id').eq('id', session.program_id).maybeSingle();
  if (!program) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };

  const chain = await chainToCoach(coach.service, program.client_id, coach.pt);
  if (chain.error) return chain;
  return { session, program, pt: coach.pt, service: coach.service };
}

// The athlete's credential: the invite token that created their profile.
export async function tokenMatchesClient(clientId, token) {
  if (!clientId || !token) return false;
  const service = createServiceClient();
  const { data } = await service
    .from('invite_tokens').select('id')
    .eq('token', token).eq('used_by_client_id', clientId).maybeSingle();
  return !!data;
}

// Any real invite token, used or in-date — enough to stop drive-by abuse of
// athlete-invoked endpoints without breaking the onboarding flow.
export async function tokenValidOrUsed(token) {
  if (!token) return false;
  const service = createServiceClient();
  const { data } = await service
    .from('invite_tokens').select('id, used_at, expires_at')
    .eq('token', token).maybeSingle();
  if (!data) return false;
  return !!data.used_at || new Date(data.expires_at) >= new Date();
}
