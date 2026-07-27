/**
 * /api/conversation/[clientId]
 *
 * Returns the raw PAX <-> client message thread so a coach can read the
 * evidence behind a brief. Read-only.
 *
 * Access: requireClientAccess — the signed-in coach must own this client.
 *
 * ⚠️ REFERENCE IMPLEMENTATION for backlog 2b.4b (console RLS, phase 2).
 * This route reads through the AUTH-AWARE client rather than the service
 * role, so the coach's own Supabase session carries into the query and the
 * coach_rw_conversations policy scopes it in the database.
 *
 * Two independent controls now, not one:
 *   1. requireClientAccess() — returns 403/404 with a clean message. Kept:
 *      it gives a good error rather than a confusing empty result.
 *   2. RLS — even with the guard removed or wrong, the query returns zero
 *      rows for someone else's athlete. This is what the 24 Jul review's
 *      Critical finding needed: a stale route with no guard leaked verbatim
 *      WhatsApp transcripts. Under RLS that same file returns nothing.
 *
 * Copy this pattern for other READ routes. Do NOT copy it for writes —
 * coaches and athletes share the `authenticated` role, so write privileges
 * cannot be separated by GRANT. See the constraint note at the bottom of
 * migrations/2026-07-25_coach_rls_policies.sql.
 *
 * Optional query: ?since=<ISO>  bounds the thread to a window — pass the
 * brief's "since last met" anchor so the thread matches the brief. Without
 * it, returns the most recent messages.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 120; // recent window when no anchor is supplied
const MAX_MESSAGES = 200;  // hard cap when bounded by ?since

async function load(clientId, sinceParam) {
  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const { client } = access;

  const since = sinceParam && /^\d{4}-\d{2}-\d{2}/.test(sinceParam) ? sinceParam : null;

  // The coach's own session — RLS applies. Contrast supabaseAdmin, which
  // bypasses it and makes the guard above the only thing standing between
  // one coach and another's athletes.
  const supabase = createClient();

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
