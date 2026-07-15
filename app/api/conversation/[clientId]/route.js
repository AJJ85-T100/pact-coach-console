/**
 * /api/conversation/[clientId]
 *
 * Returns the raw PAX <-> client message thread so a coach can read the
 * evidence behind a brief. Read-only.
 *
 * Access: requireClientAccess — the signed-in coach must own this client.
 *
 * Optional query: ?since=<ISO>  bounds the thread to a window — pass the
 * brief's "since last met" anchor so the thread matches the brief. Without
 * it, returns the most recent messages.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 120; // recent window when no anchor is supplied
const MAX_MESSAGES = 200;  // hard cap when bounded by ?since

async function load(clientId, sinceParam) {
  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const { client } = access;

  const since = sinceParam && /^\d{4}-\d{2}-\d{2}/.test(sinceParam) ? sinceParam : null;

  // Fetch newest-first so the limit keeps the *most recent* messages.
  let query = supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('client_id', client.id)
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
  const url = new URL(req.url);

  // Primary: the dynamic route param. Fallback: the last path segment — so a
  // folder-name mismatch (segment not literally [clientId]) can't silently
  // break the route.
  const params = await context?.params;
  const seg = url.pathname.split('/').filter(Boolean).pop();
  const clientId =
    params?.clientId || (seg && seg !== 'conversation' ? decodeURIComponent(seg) : null);

  return load(clientId, url.searchParams.get('since'));
}
