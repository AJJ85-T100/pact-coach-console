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
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v, max = 200) => { const s = (v ?? '').toString().trim(); return s ? s.slice(0, max) : null; };
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

const GOAL_LABELS = { fat_loss: 'Lose fat', muscle_gain: 'Build muscle', maintain: 'Maintain & feel good', performance: 'Perform' };

async function sendCoachEmail({ pt, client, row, siteUrl }) {
  const from = process.env.RESEND_FROM || 'PACT.Health <onboarding@resend.dev>';
  const reviewUrl = `${siteUrl}/dashboard/clients/${client.id}`;
  const firstName = (client.name || 'your new client').split(' ')[0];
  // ⚠️ SECURITY (review M10). Every field below is typed by whoever holds
  // the invite link, and this email is sent from the real PACT domain to the
  // coach. Unescaped, a `gym` of
  //   <a href="https://evil/">Click to review your new client</a>
  // produced a genuine PACT-branded phishing mail — a credible route to the
  // coach's magic link. Escape everything; nothing here is trusted.
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const fmt = (v) => (v == null || v === '' ? '—' : esc(v));
  const list = (a) => (Array.isArray(a) && a.length ? esc(a.join(', ')) : '—');

  const rows = [
    ['Goal', esc(GOAL_LABELS[row.goal] || '—')],
    ['Training days', list(row.training_days)],
    ['Preferred time', fmt(row.training_time)],
    ['Usual start', fmt(row.usual_time)],
    ['Session length', row.session_length_minutes ? `~${row.session_length_minutes} min` : '—'],
    ['Gym / setup', row.gym ? `${esc(row.gym)}${row.gym_address ? ` — ${esc(row.gym_address)}` : ''}` : '—'],
    ['Equipment', list(row.equipment_list)],
    ['Weight', `${fmt(row.current_weight)} kg → ${fmt(row.target_weight)} kg`],
    ['Experience', fmt(row.experience_level)],
    ['Style', fmt(row.training_style)],
    ['Injuries / notes', fmt(row.injuries)],
    ['WhatsApp', fmt(row.whatsapp_phone)],
  ].map(([k, v]) => `<tr><td style="padding:7px 0;color:#8A95A3;font-size:13px;width:140px;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;color:#0A2540;font-size:13px;font-weight:600">${v}</td></tr>`).join('');

  // Escapes quotes too — the gym photo URL lands in an attribute, where
  // &lt;/&gt; alone would not stop an attribute break-out.
  const whyItems = [
    ['Why they want this', row.motivation],
    ['Why now', row.why_now],
    ['Tried before', row.tried_before],
    ["What's tripped them up", row.biggest_blocker],
  ].filter(([, v]) => v && v.trim());
  const whyBlock = whyItems.length
    ? `<div style="background:#EBF1F5;border-left:3px solid #0A2540;border-radius:0 6px 6px 0;padding:14px 16px;margin-bottom:20px">
         <div style="color:#D92D20;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">Their why</div>
         ${whyItems.map(([k, v]) => `<p style="margin:0 0 8px;color:#0A2540;font-size:13px;line-height:1.5"><strong style="color:#8A95A3;font-weight:bold">${esc(k)}:</strong> ${esc(v)}</p>`).join('')}
       </div>`
    : '';
  // The photo URL is a 500-char free-text field on the request. Escaping is
  // not enough on its own — only render it if it actually points at our own
  // Supabase storage origin.
  const safePhotoUrl = (() => {
    const raw = row.gym_photo_url;
    if (!raw) return null;
    try {
      const u = new URL(String(raw));
      const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      return (u.protocol === 'https:' && u.origin === base.origin) ? u.toString() : null;
    } catch { return null; }
  })();
  const photoBlock = safePhotoUrl
    ? `<div style="margin-bottom:20px"><div style="color:#8A95A3;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">Their gym</div><img src="${esc(safePhotoUrl)}" alt="Gym" style="width:100%;max-height:240px;object-fit:cover;border-radius:8px;border:1px solid #E2E6EB" /></div>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0A2540;border-radius:10px 10px 0 0;padding:24px 28px">
    <div style="color:#D92D20;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin-bottom:8px">New client onboarded</div>
    <div style="color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px">${esc(client.name)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 10px 10px;padding:24px 28px;border:1px solid #E2E6EB;border-top:none">
    <p style="color:#4A4A4A;font-size:14px;line-height:1.6;margin:0 0 20px">
      ${esc(firstName)} just completed onboarding. Here's their profile — give it a review and schedule a first call to get them started.
    </p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E2E6EB;border-bottom:1px solid #E2E6EB;margin-bottom:24px">${rows}</table>
    ${whyBlock}
    ${photoBlock}
    <a href="${reviewUrl}" style="display:inline-block;background:#D92D20;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:14px 28px;border-radius:6px">Review ${esc(firstName)} &rarr;</a>
  </div>
  <p style="color:#8A95A3;font-size:11px;text-align:center;margin:18px 0 0">PACT.Health · the always-on accountability layer</p>
</div>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: pt.email, subject: `New client onboarded: ${String(client.name || '').replace(/[\r\n]/g, ' ')}`, html }),
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

    // Email is required: it's the athlete's sign-in identity — without it they
    // can't use the athlete app or PAX's begin-workout links.
    const email = (str(f.email, 120) || '').toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "We need a valid email — it's how you'll sign in to log workouts." }, { status: 400 });
    }

    const goal = GOAL_SLUGS.has(f.goal) ? f.goal : null;
    const today = new Date().toISOString().slice(0, 10);
    const cw = num(f.current_weight);

    // WhatsApp identity for the bot: it routes on `wa_phone` (digits, no +)
    // and `channel`. Derive them from the number captured at invite time so
    // PAX can reach the client the moment onboarding completes.
    const waRaw    = str(f.whatsapp_phone, 20) || invite.client_phone || null;
    const waDigits = waRaw ? waRaw.replace(/\D/g, '') : null;

    const row = {
      pt_id: invite.pt_id,
      name: str(f.name, 80) || invite.client_name || 'New client',
      email,
      goal,
      current_weight: cw,
      start_weight: cw,
      target_weight: num(f.target_weight),
      start_date: today,
      training_days: Array.isArray(f.training_days) ? f.training_days.slice(0, 7) : [],
      training_time: str(f.training_time, 40),
      usual_time: str(f.usual_time, 10),
      session_length_minutes: num(f.session_length),
      gym: str(f.gym, 80),
      gym_place_id: str(f.gym_place_id, 100),
      gym_address: str(f.gym_address, 200),
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
      whatsapp_phone: waRaw,
      wa_phone: waDigits,
      // Always 'whatsapp' — it's the platform's only live channel. A client
      // with no number yet just has wa_phone null until one is added; stamping
      // 'telegram' here would silently exclude them from every scheduled send.
      channel: 'whatsapp',
      whatsapp_invited_at: waDigits ? new Date().toISOString() : null,
      status: 'active',
      onboarding_complete: true,
    };

    // Claim the invite FIRST, conditionally on it still being unused. The
    // old order (check used_at → insert → mark used) was a read-then-write
    // race: two concurrent submits of the same token both passed the check
    // and created two athletes. `.is('used_at', null)` makes the claim
    // atomic — whoever loses gets no row back and stops here.
    const { data: claimed } = await service
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('used_at', null)
      .select('id');
    if (!claimed || !claimed.length) {
      return NextResponse.json(
        { error: 'That invite link has already been used. Ask your coach for a new one.' },
        { status: 409 },
      );
    }

    const { data: client, error: cErr } = await service
      .from('clients').insert(row).select('id, name').single();
    if (cErr) {
      console.error('[onboard] client insert failed', cErr);
      // Release the claim so a genuine retry isn't locked out by our own error.
      await service.from('invite_tokens').update({ used_at: null }).eq('id', invite.id);
      return NextResponse.json({ error: 'Could not create your profile. Please let your coach know.' }, { status: 500 });
    }

    await service
      .from('invite_tokens')
      .update({ used_by_client_id: client.id })
      .eq('id', invite.id);

    // Give them a sign-in: create (or find) the Supabase auth user for their
    // email and stamp clients.auth_user_id — the athlete app resolves them
    // through RLS via that link. Non-fatal: onboarding never fails on auth.
    if (row.email) {
      try {
        let authUserId = null;
        const { data: created, error: cuErr } = await service.auth.admin.createUser({
          email: row.email,
          email_confirm: true,
        });
        if (created?.user) {
          authUserId = created.user.id;
        } else if (cuErr) {
          // ⚠️ SECURITY (review M9). The email is only shape-validated, so
          // whoever holds the invite link can submit ANY address. When
          // createUser fails on a duplicate, this branch recovers the
          // EXISTING user's id — silently adopting someone else's identity.
          // The new clients row would then resolve for that person's login,
          // with an attacker-chosen name, weight, injuries and WhatsApp
          // number (which is where PAX sends proactive messages).
          //
          // Adopt an existing auth user only when nobody else is already
          // using it. Otherwise leave the row unlinked: onboarding still
          // completes, the coach sees the client, and sign-in is fixed
          // deliberately rather than by silently colliding two people.
          const { data: linkData } = await service.auth.admin.generateLink({
            type: 'magiclink',
            email: row.email,
          });
          const existingId = linkData?.user?.id || null;
          if (existingId) {
            const { data: taken } = await service
              .from('clients')
              .select('id')
              .eq('auth_user_id', existingId)
              .neq('id', client.id)
              .limit(1);
            if (taken && taken.length) {
              console.warn(
                `[onboard] refused to link client ${client.id}: that email already belongs to client ${taken[0].id}`
              );
            } else {
              authUserId = existingId;
            }
          }
        }
        if (authUserId) {
          await service.from('clients').update({ auth_user_id: authUserId }).eq('id', client.id);
          console.log(`[onboard] auth linked -> client ${client.id}`);
        } else {
          console.warn(`[onboard] no auth user linked for client ${client.id}`);
        }
      } catch (e) {
        console.error('[onboard] auth link failed (non-fatal)', e);
      }
    }

    // Notify the coach: surfaces in the dashboard activity feed as a prompt to
    // review the new profile and schedule a first call. Non-critical — never
    // block the client's success on it.
    try {
      await service.from('milestones').insert({ client_id: client.id, key: 'completed_onboarding' });
    } catch (e) {
      console.error('[onboard] milestone insert failed (non-fatal)', e);
    }

    // Fire PAX's WhatsApp welcome (approved template) via the bot — the
    // compliant first touch on the client's cold number. Non-fatal.
    try {
      const botUrl = process.env.BOT_URL;
      if (botUrl && process.env.WELCOME_SECRET && waDigits) {
        await fetch(`${botUrl.replace(/\/$/, '')}/welcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-welcome-secret': process.env.WELCOME_SECRET },
          body: JSON.stringify({ client_id: client.id }),
        });
      }
    } catch (e) {
      console.error('[onboard] PAX welcome trigger failed (non-fatal)', e);
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
