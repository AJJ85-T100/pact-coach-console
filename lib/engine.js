/**
 * lib/engine.js — server-side calls to the PACT V2 engine as the signed-in coach.
 *
 * The engine checks the coach's own Supabase token and scopes everything to
 * their roster, so the console never needs the service role for this.
 */
import { createClient } from '@/lib/supabase/server';

const ENGINE_URL = (process.env.ENGINE_URL || 'https://pact-engine.alexjjoyner.workers.dev').replace(/\/$/, '');

export async function engineFetch(path, init = {}) {
  const supabase = createClient();
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) return { status: 401, json: { error: 'Not signed in.' } };
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch (e) {
    return { status: 502, json: { error: 'Could not reach the PACT engine.' } };
  }
}
