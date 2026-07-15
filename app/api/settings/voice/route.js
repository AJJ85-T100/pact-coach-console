/**
 * /api/settings/voice
 *
 * The coach's voice calibration — how PAX sounds when it speaks as an
 * extension of them. PT-scoped (resolved from the session), not client-scoped.
 *
 * GET  → { voice_calibration }
 * PUT  → save { voice_calibration }
 * POST → { sample } — generate a live example morning message in the given
 *        (unsaved) profile, so the coach hears the voice before committing.
 *        Requires ANTHROPIC_API_KEY (already set for briefs/reports).
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

const clampN = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null; };
const str = (v, max) => { const s = (v ?? '').toString().trim(); return s ? s.slice(0, max) : null; };

function sanitize(v = {}) {
  return {
    tough_love: clampN(v.tough_love),
    technical: clampN(v.technical),
    formality: clampN(v.formality),
    brevity: clampN(v.brevity),
    phrases: str(v.phrases, 400),
    never_say: str(v.never_say, 400),
    notes: str(v.notes, 600),
  };
}

// Mirrors lib/pax/voice.js in the bot — keep the two in step if bands change.
function voiceLines(v, coach) {
  const band = (n, low, high) => (n == null ? null : n < 35 ? low : n > 65 ? high : null);
  const lines = [];
  const picks = [
    band(v.tough_love, 'Lead with encouragement — warmth first, challenge second.', 'Tough love — direct, straight to the point, challenge without cushioning. Never guilt.'),
    band(v.technical, 'Plain language only — no training jargon.', 'Comfortable with training terminology (RPE, tempo, deload), used naturally.'),
    band(v.formality, 'Casual — contractions, colloquial, like texting a friend.', 'Polished — tidy sentences, professional register.'),
    band(v.brevity, 'As brief as a message can be while still landing.', 'A touch more context and reasoning — still WhatsApp-length.'),
  ];
  for (const p of picks) if (p) lines.push(`- ${p}`);
  if (v.phrases) lines.push(`- Phrases ${coach} actually uses (weave in sparingly): ${v.phrases}`);
  if (v.never_say) lines.push(`- Never say: ${v.never_say}`);
  if (v.notes) lines.push(`- In ${coach}'s own words: ${v.notes}`);
  return lines.join('\n');
}

async function resolvePt() {
  const supabase = createClient();
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };

  const service = createServiceClient();
  const { data: pt, error } = await service
    .from('personal_trainers')
    .select('id, name, voice_calibration')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error || !pt) return { error: NextResponse.json({ error: 'No coach profile for this account.' }, { status: 403 }) };
  return { pt, service };
}

export async function GET() {
  noStore();
  const r = await resolvePt();
  if (r.error) return r.error;
  return NextResponse.json({ voice_calibration: r.pt.voice_calibration || null });
}

export async function PUT(req) {
  noStore();
  const r = await resolvePt();
  if (r.error) return r.error;

  const body = await req.json().catch(() => ({}));
  const profile = sanitize(body.voice_calibration || {});

  const { error } = await r.service
    .from('personal_trainers')
    .update({ voice_calibration: profile })
    .eq('id', r.pt.id);
  if (error) {
    console.error('[voice] save failed', error);
    return NextResponse.json({ error: 'Could not save your voice profile.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, voice_calibration: profile });
}

export async function POST(req) {
  noStore();
  const r = await resolvePt();
  if (r.error) return r.error;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Sample generation is not configured on the server.' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const profile = sanitize(body.voice_calibration || {});
  const coach = (r.pt.name || 'the coach').split(' ')[0];
  const voiceBlock = voiceLines(profile, coach);

  const system = `You are PAX, the AI accountability companion on PACT.Health — the always-on presence between a coach's sessions. You are writing ONE sample morning message so ${coach} can hear how you would sound speaking as an extension of them.

${voiceBlock ? `HOW ${coach.toUpperCase()} TALKS:\n${voiceBlock}\n` : ''}
Hard rules regardless of style: first-name use, no fitness clichés ("crush it", "beast mode", "you've got this"), no toxic positivity, no guilt. Plain text, no markdown. 60–90 words.`;

  const user = `Write this morning's message for a fictional client, Sam: slept 6h 40 (readiness okay, not great), yesterday was a pull session so their back will be worked, today's plan is a 45-minute lower-body session at 5:30pm, and they're 4.2kg down with 2.8kg to their goal. One clear objective for the day. Write only the message.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) {
      console.error('[voice] sample error', res.status, await res.text());
      return NextResponse.json({ error: 'Sample generation failed.' }, { status: 502 });
    }
    const json = await res.json();
    const sample = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return NextResponse.json({ sample });
  } catch (e) {
    console.error('[voice] sample threw', e);
    return NextResponse.json({ error: 'Sample generation failed.' }, { status: 502 });
  }
}
