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

const GOAL_LABELS = { fat_loss: 'Lose fat', muscle_gain: 'Build muscle', maintain: 'Maintain & feel good', performance: 'Perform' };

async function sendCoachEmail({ pt, client, row, siteUrl }) {
  const from = process.env.RESEND_FROM || 'PACT.Health <onboarding@resend.dev>';
  const reviewUrl = `${siteUrl}/dashboard/clients/${client.id}`;
  const firstName = (client.name || 'your new client').split(' ')[0];
  const fmt = (v) => (v == null || v === '' ? '—' : v);
  const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '—');

  const rows = [
    ['Goal', GOAL_LABELS[row.goal] || '—'],
    ['Training days', list(row.training_days)],
    ['Preferred time', fmt(row.training_time)],
    ['Gym / setup', fmt(row.gym)],
    ['Equipment', list(row.equipment_list)],
    ['Weight', `${fmt(row.current_weight)} kg → ${fmt(row.target_weight)} kg`],
    ['Experience', fmt(row.experience_level)],
    ['Style', fmt(row.training_style)],
    ['Injuries / notes', fmt(row.injuries)],
    ['WhatsApp', fmt(row.whatsapp_phone)],
  ].map(([k, v]) => `<tr><td style="padding:7px 0;color:#8A95A3;font-size:13px;width:140px;vertical-align:top">${k}</td><td style="padding:7px 0;color:#0A2540;font-size:13px;font-weight:600">${v}</td></tr>`).join('');

  const esc = (s) => (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const whyItems = [
    ['Why they want this', row.motivation],
    ['Why now', row.why_now],
    ['Tried before', row.tried_before],
    ["What's tripped them up", row.biggest_blocker],
  ].filter(([, v]) => v && v.trim());
  const whyBlock = whyItems.length
    ? `<div style="background:#EBF1F5;border-left:3px solid #0A2540;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:20px">
         <div style="color:#D92D20;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">Their why</div>
         ${whyItems.map(([k, v]) => `<p style="margin:0 0 8px;color:#0A2540;font-size:13px;line-height:1.5"><strong style="color:#8A95A3;font-weight:bold">${k}:</strong> ${esc(v)}</p>`).join('')}
       </div>`
    : '';
  const photoBlock = row.gym_photo_url
    ? `<div style="margin-bottom:20px"><div style="color:#8A95A3;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">Their gym</div><img src="${row.gym_photo_url}" alt="Gym" style="width:100%;max-height:240px;object-fit:cover;border-radius:8px;border:1px solid #E2E6EB" /></div>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0A2540;border-radius:10px 10px 0 0;padding:24px 28px">
    <div style="color:#D92D20;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">New client onboarded</div>
    <div style="color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px">${client.name}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 10px 10px;padding:24px 28px;border:1px solid #E2E6EB;border-top:none">
    <p style="color:#4A4A4A;font-size:14px;line-height:1.6;margin:0 0 20px">
      ${firstName} just completed onboarding. Here's their profile — give it a review and schedule a first call to get them started.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E2E6EB;border-bottom:1px solid #E2E6EB;margin-bottom:24px">${rows}</table>
    ${whyBlock}
    ${photoBlock}
    <a href="${reviewUrl}" style="display:inline-block;background:#D92D20;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:14px 28px;border-radius:6px">Review ${firstName} &rarr;</a>
  </div>
  <p style="color:#8A95A3;font-size:11px;text-align:center;margin:18px 0 0">PACT.Health · the always-on accountability layer</p>
</div>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: pt.email, subject: `New client onboarded: ${client.name}`, html }),
  });
}

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
      motivation: str(f.motivation, 1000),
      tried_before: str(f.tried_before, 1000),
      why_now: str(f.why_now, 1000),
      biggest_blocker: str(f.biggest_blocker, 1000),
      gym_photo_url: str(f.gym_photo_url, 500),
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

    // Email the coach (Resend). Env-gated so it silently no-ops until configured.
    try {
      if (process.env.RESEND_API_KEY) {
        const { data: pt } = await service
          .from('personal_trainers').select('name, email').eq('id', invite.pt_id).maybeSingle();
        if (pt?.email) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
          await sendCoachEmail({ pt, client, row, siteUrl });
        }
      }
    } catch (e) {
      console.error('[onboard] coach email failed (non-fatal)', e);
    }

    return NextResponse.json({ ok: true, client_id: client.id, name: client.name });
  } catch (e) {
    console.error('[onboard] exception', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
