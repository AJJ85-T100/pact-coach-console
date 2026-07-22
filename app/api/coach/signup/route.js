/**
 * POST /api/coach/signup
 *
 * Self-serve, code-gated coach signup (pilot). Creates the coach for real —
 * a Supabase auth user + a personal_trainers row linked to it — so no manual
 * Supabase step. The client then triggers a magic link to sign them in.
 *
 * Body: { name, email, business_name?, whatsapp_number?, code }
 */

import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Hard-coded pilot gate (per Alex). Change this string to rotate the code.
const SIGNUP_CODE = 'PACT-PILOT-2026';

const clean = (v, max = 120) => (v ?? '').toString().trim().slice(0, max);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const code = clean(body.code, 40);
  if (code !== SIGNUP_CODE) {
    return NextResponse.json({ error: "That signup code isn't valid. Ask PACT for the current one." }, { status: 403 });
  }

  const name     = clean(body.name, 80);
  const email    = clean(body.email, 120).toLowerCase();
  const business = clean(body.business_name, 80) || null;
  const waNumber = clean(body.whatsapp_number, 20) || null;
  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A name and a valid email are required.' }, { status: 400 });
  }

  const service = createServiceClient();

  // Already a coach on this email?
  const { data: existing } = await service
    .from('personal_trainers').select('id').eq('email', email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A coach account already exists for that email — just sign in.' }, { status: 409 });
  }

  // Create (or find) the Supabase auth user.
  let authUserId = null;
  const { data: created, error: cuErr } = await service.auth.admin.createUser({ email, email_confirm: true });
  if (created?.user) {
    authUserId = created.user.id;
  } else if (cuErr) {
    // Likely already registered as an athlete/auth user — reuse it.
    const { data: link } = await service.auth.admin.generateLink({ type: 'magiclink', email });
    authUserId = link?.user?.id || null;
  }

  // No auth user after both attempts? Stop here — inserting a coach row with
  // a null auth_user_id creates an account the console can never match to a
  // login ("Account created" but sign-in dead-ends).
  if (!authUserId) {
    console.error('[coach-signup] could not create or resolve an auth user', cuErr);
    return NextResponse.json({ error: 'Signup failed — please try again, or contact PACT if it keeps happening.' }, { status: 500 });
  }

  // This login is already a coach? (auth_user_id is unique on the table.)
  const { data: coachDupe } = await service
    .from('personal_trainers').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (coachDupe) {
    return NextResponse.json({ error: 'A coach account already exists for this login — just sign in.' }, { status: 409 });
  }

  const console_token = randomBytes(24).toString('hex');
  const { data: pt, error: ptErr } = await service
    .from('personal_trainers')
    .insert({
      id: randomUUID(),                 // table has no default on id — supply one
      name,
      email,
      business_name: business,
      whatsapp_phone: waNumber,         // the coach's own number
      wa_display_number: waNumber,
      console_token,
      auth_user_id: authUserId,
      status: 'active',
    })
    .select('id, name')
    .single();

  if (ptErr) {
    console.error('[coach-signup] insert failed', ptErr);
    return NextResponse.json({ error: 'Signup failed — please try again, or contact PACT if it keeps happening.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, name: pt.name });
}
