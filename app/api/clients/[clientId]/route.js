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
// program_sessions hangs off programs, handled explicitly below; so do
// set_logs (workout_logs) and form_clips (set_logs).
//
// ⚠️ COMPLETENESS (security review, data protection). This list used to stop
// at 16 tables, leaving behind: activities (incl. heart rate), workout_logs
// and set_logs (per-set weight/reps/RPE), form_clips AND the storage objects
// they point at (video of the person training), coach_notes (the coach's
// free-text notes about them), terra_connections, appointments, lift_history,
// pact_checkins, calendar_days and calendar_connections — plus the Supabase
// auth user, which was never deleted at all. Because the clients row went
// first, nothing in the UI could find the orphans afterwards.
//
// Anything added here must also be added to the athlete data export
// (/api/clients/[clientId]/export) — the two lists describe the same set:
// everything we hold about one person.
const CHILD_TABLES = [
  'conversations', 'health_data', 'daily_pacts', 'custom_pacts', 'win_stack',
  'weigh_ins', 'milestones', 'slip_events', 'mood_ratings', 'coach_meetings',
  'weekly_pacts', 'weekend_pacts', 'stakes', 'cosigners', 'client_memory',
  'programme',
  // added 2026-07-24
  'activities', 'coach_notes', 'terra_connections', 'appointments',
  'lift_history', 'pact_checkins', 'calendar_days', 'notifications',
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

  // Per-step receipt. Erasure used to swallow every error and still return
  // { ok: true }, so a partial erase was indistinguishable from a complete
  // one — and undetectable afterwards, because the clients row was gone.
  const receipt = [];
  const step = async (label, fn) => {
    try {
      const r = await fn();
      receipt.push({ step: label, ok: true, ...(r || {}) });
    } catch (e) {
      console.error(`[clients] erase ${label} failed`, e?.message || e);
      receipt.push({ step: label, ok: false, error: e?.message || 'failed' });
    }
  };

  // Grab the auth link and the storage paths BEFORE the rows go.
  let authUserId = null;
  let clipPaths = [];
  await step('collect', async () => {
    const { data: c } = await supabase.from('clients')
      .select('auth_user_id').eq('id', clientId).maybeSingle();
    authUserId = c?.auth_user_id || null;
    const { data: clips } = await supabase.from('form_clips')
      .select('storage_path').eq('client_id', clientId);
    clipPaths = (clips || []).map(r => r.storage_path).filter(Boolean);
    return { clips: clipPaths.length };
  });

  // Form clip objects. The rows are deleted below; without this the videos
  // themselves survive in the bucket with nothing pointing at them.
  if (clipPaths.length) {
    await step('storage:form-clips', async () => {
      const { error } = await supabase.storage.from('form-clips').remove(clipPaths);
      if (error) throw new Error(error.message);
      return { removed: clipPaths.length };
    });
  }

  // FK chains, deepest first.
  await step('workout_logs+set_logs+form_clips', async () => {
    const { data: logs } = await supabase.from('workout_logs')
      .select('id').eq('client_id', clientId);
    const logIds = (logs || []).map(r => r.id);
    const { data: sets } = await supabase.from('set_logs')
      .select('id').eq('client_id', clientId);
    const setIds = (sets || []).map(r => r.id);
    if (setIds.length) await supabase.from('form_clips').delete().in('set_log_id', setIds);
    await supabase.from('form_clips').delete().eq('client_id', clientId);
    if (logIds.length) await supabase.from('set_logs').delete().in('workout_log_id', logIds);
    await supabase.from('set_logs').delete().eq('client_id', clientId);
    await supabase.from('workout_logs').delete().eq('client_id', clientId);
    return { workouts: logIds.length, sets: setIds.length };
  });

  await step('programs+program_sessions', async () => {
    const { data: programs } = await supabase.from('programs')
      .select('id').eq('client_id', clientId);
    const ids = (programs || []).map((p) => p.id);
    if (ids.length) await supabase.from('program_sessions').delete().in('program_id', ids);
    await supabase.from('programs').delete().eq('client_id', clientId);
    return { programs: ids.length };
  });

  for (const table of CHILD_TABLES) {
    await step(table, async () => {
      const { error } = await supabase.from(table).delete().eq('client_id', clientId);
      // 42P01 = table doesn't exist on this deployment; that's not a failure.
      if (error && error.code !== '42P01') throw new Error(error.message);
      return {};
    });
  }

  // The athlete's calendar connection is keyed by owner_type/owner_id.
  await step('calendar_connections', async () => {
    const { error } = await supabase.from('calendar_connections')
      .delete().eq('owner_type', 'client').eq('owner_id', clientId);
    if (error && error.code !== '42P01') throw new Error(error.message);
    return {};
  });

  // Invite token: null the link AND clear the personal data it retained.
  // It kept client_name and client_phone after erasure.
  await step('invite_tokens', async () => {
    const { error } = await supabase.from('invite_tokens')
      .update({ used_by_client_id: null, client_name: null, client_phone: null })
      .eq('used_by_client_id', clientId);
    if (error) throw new Error(error.message);
    return {};
  });

  const { error: delErr } = await supabase.from('clients').delete().eq('id', clientId);
  if (delErr) {
    console.error('[clients] final delete failed', delErr);
    receipt.push({ step: 'clients', ok: false, error: delErr.message });
    return NextResponse.json(
      {
        error: 'Child data was removed but the client row could not be deleted — check server logs for a remaining foreign key.',
        receipt,
      },
      { status: 500 },
    );
  }
  receipt.push({ step: 'clients', ok: true });

  // The Supabase auth user — their email identity. No deleteUser call
  // existed anywhere in either repo, so an "erased" athlete kept a
  // working login and their address stayed in auth.users indefinitely.
  if (authUserId) {
    await step('auth_user', async () => {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) throw new Error(error.message);
      return {};
    });
  }

  const failed = receipt.filter(r => !r.ok);
  if (failed.length) {
    console.warn('[clients] erase completed with failures:', failed.map(f => f.step).join(', '));
  }
  return NextResponse.json({
    ok: failed.length === 0,
    mode: 'erase',
    complete: failed.length === 0,
    failed_steps: failed.map(f => f.step),
    receipt,
  });
}
