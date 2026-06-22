/**
 * POST /api/onboard/complete
 *
 * Public (token-authorised) — the invite token is the credential, there is no
 * coach session on the client device. Validates the token (exists, unused, not
 * expired), creates the client under the invite's pt_id, then locks the token
 * so the link can't be reused.
 *
 * Body: { token: string, form: {...} }
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const GOAL_SLUGS = new Set(['fat_loss', 'muscle_gain', 'maintain', 'performance']);

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const str = (v, max = 200) => { const s = (v ?? '').toString().trim(); return s ? s.slice(0, max) : null; };
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = (body.token || '').toString().trim();
    if (!token) return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 });

    const service = createServiceClient();

    const { data: invite, error: invErr } = await service
      .from('invite_tokens').select('*').eq('token', token).maybeSingle();
    if (invErr) return NextResponse.json({ error: 'Could not validate the invite.' }, { status: 500 });
    if (!invite) return NextResponse.json({ error: 'This invite link is not valid.' }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 409 });
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invite link has expired.' }, { status: 410 });

    const f = body.form || {};
    const goal = GOAL_SLUGS.has(f.goal) ? f.goal : null;
    const today = new Date().toISOString().slice(0, 10);
    const cw = num(f.current_weight);

    const row = {
      pt_id: invite.pt_id,
      name: str(f.name, 80) || invite.client_name || 'New client',
      email: str(f.email, 120),
      goal,
      current_weight: cw,
      start_weight: cw,
      target_weight: num(f.target_weight),
      start_date: today,
      training_days: Array.isArray(f.training_days) ? f.training_days.slice(0, 7) : [],
      training_time: str(f.training_time, 40),
      gym: str(f.gym, 80),
      equipment_list: Array.isArray(f.equipment_list) ? f.equipment_list.slice(0, 24) : [],
      experience_level: str(f.experience_level, 40),
      training_style: str(f.training_style, 40),
      injuries: str(f.injuries, 500),
      event_name: str(f.event_name, 80),
      event_date: isoDate(f.event_date),
      target_date: isoDate(f.event_date),
      whatsapp_phone: str(f.whatsapp_phone, 20) || invite.client_phone || null,
      whatsapp_invited_at: new Date().toISOString(),
      status: 'active',
      onboarding_complete: true,
    };

    const { data: client, error: cErr } = await service
      .from('clients').insert(row).select('id, name').single();
    if (cErr) {
      console.error('[onboard] client insert failed', cErr);
      return NextResponse.json({ error: 'Could not create your profile. Please let your coach know.' }, { status: 500 });
    }

    await service
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by_client_id: client.id })
      .eq('id', invite.id);

    // Notify the coach: surfaces in the dashboard activity feed as a prompt to
    // review the new profile and schedule a first call. Non-critical — never
    // block the client's success on it.
    try {
      await service.from('milestones').insert({ client_id: client.id, key: 'completed_onboarding' });
    } catch (e) {
      console.error('[onboard] milestone insert failed (non-fatal)', e);
    }

    return NextResponse.json({ ok: true, client_id: client.id, name: client.name });
  } catch (e) {
    console.error('[onboard] exception', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
