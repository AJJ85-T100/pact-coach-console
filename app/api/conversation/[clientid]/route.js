/**
 * /api/conversation/[clientId]
 *
 * Returns the raw PAX <-> client message thread so a coach can read the
 * evidence behind a brief. Read-only.
 *
 * Trust model mirrors /api/briefs: uses the service-role admin client and
 * takes clientId straight from the URL — the UI only ever passes clientIds
 * from the coach's own roster. (A real per-coach ownership check across all
 * these routes is a separate hardening pass, worth doing before the pilot
 * widens.)
 *
 * Optional query: ?since=<ISO>  bounds the thread to a window — pass the
 * brief's "since last met" anchor so the thread matches the brief. Without
 * it, returns the most recent messages.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 120; // recent window when no anchor is supplied
const MAX_MESSAGES = 200;  // hard cap when bounded by ?since

async function load(clientId, sinceParam) {
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr) {
    console.error('[conversation] client load failed', clientErr);
    return NextResponse.json({ error: 'Could not load client.' }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const since = sinceParam && /^\d{4}-\d{2}-\d{2}/.test(sinceParam) ? sinceParam : null;

  // Fetch newest-first so the limit keeps the *most recent* messages.
  let query = supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(since ? MAX_MESSAGES : DEFAULT_LIMIT);
  if (since) query = query.gte('created_at', since);

  const { data, error } = await query;
  if (error) {
    console.error('[conversation] thread load failed', error);
    return NextResponse.json({ error: 'Could not load the conversation.' }, { status: 500 });
  }

  // Return oldest-first for natural top-to-bottom reading.
  const messages = (data || [])
    .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }))
    .reverse();

  return NextResponse.json(
    {
      client: { id: client.id, name: client.name },
      since: since || null,
      count: messages.length,
      messages,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}

export async function GET(req, context) {
  noStore();
  const params = await context.params;
  const since = new URL(req.url).searchParams.get('since');
  return load(params?.clientId, since);
}
