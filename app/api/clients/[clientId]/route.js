/**
 * /api/clients/[clientId] — DELETE
 *
 * Two modes, both guarded by requireClientAccess:
 *
 *   ?mode=archive (default)  → sets status 'churned'. Reversible; the client
 *                              drops out of active crons and rosters but all
 *                              history is kept.
 *   ?mode=erase              → hard-deletes the client and all child data
 *                              (GDPR erasure). Requires body { confirm_name }
 *                              matching the client's name exactly.
 *
 * Child tables are deleted best-effort before the client row; a table that
 * doesn't exist in this environment is skipped rather than failing the whole
 * erasure.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

// Child tables keyed by client_id. Order matters only for FK chains we know:
// program_sessions hangs off programs, handled explicitly below.
const CHILD_TABLES = [
  'conversations', 'health_data', 'daily_pacts', 'custom_pacts', 'win_stack',
  'weigh_ins', 'milestones', 'slip_events', 'mood_ratings', 'coach_meetings',
  'weekly_pacts', 'weekend_pacts', 'stakes', 'cosigners', 'client_memory',
  'programme',
];

export async function DELETE(req, context) {
  noStore();
  const params = await context.params;
  const url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean).pop();
  const clientId = params?.clientId || (seg && seg !== 'clients' ? decodeURIComponent(seg) : null);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const { client } = access;

  const mode = url.searchParams.get('mode') === 'erase' ? 'erase' : 'archive';

  if (mode === 'archive') {
    const { error } = await supabase.from('clients')
      .update({ status: 'churned' }).eq('id', clientId);
    if (error) {
      console.error('[clients] archive failed', error);
      return NextResponse.json({ error: 'Could not archive the client.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, mode: 'archive' });
  }

  // ── Hard erase ──
  const body = await req.json().catch(() => ({}));
  if ((body.confirm_name || '').trim() !== (client.name || '').trim()) {
    return NextResponse.json(
      { error: 'Name confirmation does not match — nothing was deleted.' },
      { status: 400 },
    );
  }

  // program_sessions via programs first (FK chain).
  try {
    const { data: programs } = await supabase.from('programs')
      .select('id').eq('client_id', clientId);
    const ids = (programs || []).map((p) => p.id);
    if (ids.length) await supabase.from('program_sessions').delete().in('program_id', ids);
    await supabase.from('programs').delete().eq('client_id', clientId);
  } catch (e) {
    console.error('[clients] program erase step failed (continuing)', e);
  }

  for (const table of CHILD_TABLES) {
    try {
      const { error } = await supabase.from(table).delete().eq('client_id', clientId);
      if (error && error.code !== '42P01') console.error(`[clients] erase ${table}:`, error.message);
    } catch (e) {
      console.error(`[clients] erase ${table} threw (continuing)`, e);
    }
  }

  // Unlink any invite token pointing at this client, then remove the client.
  try {
    await supabase.from('invite_tokens')
      .update({ used_by_client_id: null }).eq('used_by_client_id', clientId);
  } catch { /* non-fatal */ }

  const { error: delErr } = await supabase.from('clients').delete().eq('id', clientId);
  if (delErr) {
    console.error('[clients] final delete failed', delErr);
    return NextResponse.json(
      { error: 'Child data was removed but the client row could not be deleted — check server logs for a remaining foreign key.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, mode: 'erase' });
}
