/**
 * /api/pacts/[clientId]
 *
 * Coach-authored pacts for one client — the standing weekly wins PAX
 * enforces daily and scores into the stack.
 *
 * GET    → list pacts (all statuses) + a live 7-day read per pact
 * POST   → create a pact   { name, rule?, metric, target_value?, days_per_week?, cadence }
 * PATCH  → update a pact   { pact_id, ...fields } (status changes: active|paused|retired)
 *
 * Access: requireClientAccess — the signed-in coach must own this client.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

const METRICS = new Set(['steps', 'protein', 'sleep_hours', 'sessions_per_week', 'weigh_in', 'log_meals', 'custom']);
const STATUSES = new Set(['active', 'paused', 'retired']);
const DAY = 86400000;

const str = (v, max = 120) => { const s = (v ?? '').toString().trim(); return s ? s.slice(0, max) : null; };
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function getClientId(context, req) {
  // Param first; path-segment fallback (folder-name mismatch immunity).
  const seg = new URL(req.url).pathname.split('/').filter(Boolean).pop();
  return context?.params?.clientId || (seg && seg !== 'pacts' ? decodeURIComponent(seg) : null);
}

/* ---------- GET: list + live reads ---------- */

export async function GET(req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId || getClientId({ params }, req);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  const [pactsRes, stackRes, healthRes] = await Promise.all([
    supabase.from('custom_pacts')
      .select('*').eq('client_id', clientId).order('created_at', { ascending: true }),
    supabase.from('win_stack')
      .select('pact_ref, date').eq('client_id', clientId)
      .gte('date', new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10)),
    supabase.from('health_data')
      .select('steps, protein, raw, created_at').eq('client_id', clientId)
      .gte('created_at', new Date(Date.now() - 7 * DAY).toISOString())
      .order('created_at', { ascending: false }).limit(60),
  ]);

  const stack = stackRes.data || [];
  const health = healthRes.data || [];

  // One row per day (latest cumulative) for averages.
  const byDay = {};
  for (const h of health) {
    const d = (h.created_at || '').slice(0, 10);
    if (d && !byDay[d]) byDay[d] = h;
  }
  const days = Object.values(byDay);
  const avg = (fn) => {
    const vals = days.map(fn).filter((v) => v != null && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgSteps = avg((d) => d.steps);
  const avgProtein = avg((d) => d.protein);
  const avgSleep = avg((d) => d.raw?.sleep);

  const pacts = (pactsRes.data || []).map((p) => {
    const stacked7d = stack.filter((s) => s.pact_ref === p.id).length;
    let read = null;
    if (p.metric === 'steps' && avgSteps != null) read = `Avg ${Math.round(avgSteps).toLocaleString()} · 7 days`;
    if (p.metric === 'protein' && avgProtein != null) read = `Avg ${Math.round(avgProtein)}g this week`;
    if (p.metric === 'sleep_hours' && avgSleep != null) {
      const h = Math.floor(avgSleep); const m = Math.round((avgSleep % 1) * 60);
      read = `Avg ${h}h ${String(m).padStart(2, '0')}m`;
    }
    if (p.metric === 'sessions_per_week') read = `${stacked7d} of ${p.days_per_week || p.target_value || '?'} this week`;
    if (!read && stacked7d > 0) read = `${stacked7d} stacked this week`;

    // WATCH when a target pact's weekly average is short of target.
    let signal = 'on';
    if (p.status !== 'active') signal = p.status;
    else if (p.metric === 'steps' && avgSteps != null && p.target_value && avgSteps < p.target_value * 0.9) signal = 'watch';
    else if (p.metric === 'protein' && avgProtein != null && p.target_value && avgProtein < p.target_value * 0.9) signal = 'watch';
    else if (p.metric === 'sleep_hours' && avgSleep != null && p.target_value && avgSleep < p.target_value) signal = 'watch';

    return { ...p, live: { read, signal, stacked7d } };
  });

  return NextResponse.json({ client: access.client, pacts }, {
    headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
  });
}

/* ---------- POST: create ---------- */

export async function POST(req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId || getClientId({ params }, req);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  const body = await req.json().catch(() => ({}));
  const name = str(body.name, 80);
  const metric = METRICS.has(body.metric) ? body.metric : 'custom';
  if (!name) return NextResponse.json({ error: 'A pact needs a name.' }, { status: 400 });

  const row = {
    client_id: clientId,
    name,
    rule: str(body.rule, 200) || name,
    cadence: body.cadence === 'weekly' ? 'weekly' : 'daily',
    metric,
    target_value: num(body.target_value),
    days_per_week: metric === 'sessions_per_week' ? (num(body.days_per_week) || num(body.target_value) || null) : null,
    created_by: 'coach',
    status: 'active',
    current_streak: 0,
    longest_streak: 0,
  };

  const { data, error } = await supabase.from('custom_pacts').insert(row).select().single();
  if (error) {
    console.error('[pacts] insert failed', error);
    return NextResponse.json({ error: 'Could not create the pact.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pact: data });
}

/* ---------- PATCH: update / status ---------- */

export async function PATCH(req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId || getClientId({ params }, req);

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;

  const body = await req.json().catch(() => ({}));
  const pactId = str(body.pact_id, 60);
  if (!pactId) return NextResponse.json({ error: 'pact_id required.' }, { status: 400 });

  const updates = {};
  if (body.name !== undefined) updates.name = str(body.name, 80);
  if (body.rule !== undefined) updates.rule = str(body.rule, 200);
  if (body.target_value !== undefined) updates.target_value = num(body.target_value);
  if (body.days_per_week !== undefined) updates.days_per_week = num(body.days_per_week);
  if (body.status !== undefined && STATUSES.has(body.status)) updates.status = body.status;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  // Scope the update to this client so a pact_id from another roster is a no-op.
  const { data, error } = await supabase.from('custom_pacts')
    .update(updates).eq('id', pactId).eq('client_id', clientId).select().maybeSingle();
  if (error) {
    console.error('[pacts] update failed', error);
    return NextResponse.json({ error: 'Could not update the pact.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Pact not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, pact: data });
}
