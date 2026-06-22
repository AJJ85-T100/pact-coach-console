/**
 * /api/at-risk/[clientId]
 *
 * For a single flagged client, computes the at-risk signals (silence, adherence,
 * slips, broken pacts) and asks PAX (Claude) for two things: a plain diagnosis for
 * the coach, and a low-pressure re-engagement message the coach can send. The
 * message is deliberately guilt-free and plan-free — the brief is to reopen the
 * conversation, not to coach. Mirrors the reports route's grounding discipline.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';
const DAY = 86400000;

function pct(rows) {
  const wins = rows.reduce((a, d) => a + (d.wins_completed || 0), 0);
  const total = rows.reduce((a, d) => a + (d.total_wins || 0), 0);
  return total > 0 ? Math.round((wins / total) * 100) : null;
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

async function generate(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, { status: 500 });
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients').select('*').eq('id', clientId).maybeSingle();
  if (clientErr) return NextResponse.json({ error: 'Could not load client.' }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });

  const now = Date.now();
  const since14Date = new Date(now - 14 * DAY).toISOString().slice(0, 10);

  const [pactsRes, convRes, customRes, progRes] = await Promise.all([
    supabase.from('daily_pacts')
      .select('date, wins_completed, total_wins, status')
      .eq('client_id', clientId).gt('date', since14Date).order('date', { ascending: true }),
    supabase.from('conversations')
      .select('role, content, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30),
    supabase.from('custom_pacts')
      .select('name, rule, current_streak, longest_streak, last_broken_date, status')
      .eq('client_id', clientId),
    supabase.from('programs')
      .select('name, weeks, status').eq('client_id', clientId).eq('status', 'active').limit(1),
  ]);

  const pacts = pactsRes.data || [];
  const convAll = convRes.data || [];
  const customs = customRes.data || [];
  const program = progRes.data?.[0] || null;

  const adherence_pct = pct(pacts);
  const days_logged = pacts.length;
  const slip_days = pacts.filter((d) => (d.status && d.status !== 'kept') || (d.total_wins && d.wins_completed < d.total_wins)).length;

  const lastClientMsg = convAll.find((m) => m.role === 'user') || null;
  const lastPact = pacts.length ? pacts[pacts.length - 1].date : null;
  const lastActivityISO = lastClientMsg?.created_at || (lastPact ? new Date(lastPact).toISOString() : null);
  const days_silent = daysSince(lastClientMsg?.created_at);

  const broken_pacts = customs
    .filter((p) => (p.current_streak ?? 0) === 0 || (p.status && p.status !== 'active'))
    .map((p) => `${p.name} — streak ${p.current_streak ?? 0} (best ${p.longest_streak ?? 0})${p.last_broken_date ? `, broke ${p.last_broken_date}` : ''}`);

  const convo = convAll.slice(0, 16).reverse()
    .map((m) => `${m.role === 'assistant' ? 'PAX' : m.role === 'coach' ? 'Coach' : 'Client'}: ${String(m.content || '').slice(0, 240)}`)
    .join('\n');

  const dataBlock = `CLIENT
Name: ${client.name || 'Unknown'}
Goal: ${client.goal || client.goal_text || 'Not recorded'}
Active programme: ${program ? `${program.name} (${program.weeks || '?'} wks)` : 'None'}

ENGAGEMENT (last 14 days)
Days logged: ${days_logged} · Adherence: ${adherence_pct ?? 'n/a'}% · Slip days: ${slip_days}
Days since the client last messaged: ${days_silent ?? 'unknown'}
Last activity: ${lastActivityISO ? lastActivityISO.slice(0, 10) : 'none in window'}

CUSTOM PACTS (broken / lapsed)
${broken_pacts.join('\n') || 'None broken'}

RECENT CONVERSATION
${convo || 'No recent messages.'}`;

  const systemPrompt = `You are PAX, the AI accountability companion inside PACT.Health. This client has been flagged as at risk of dropping off. Help their coach re-engage them.

Two jobs: (1) tell the coach plainly WHY this client is at risk, grounded only in the data given — never invent events; if the data is thin, say so; (2) draft a short WhatsApp message the coach can send to reopen the conversation.

The re-engagement message must be a low-pressure, human check-in. NO guilt. NO plan-talk, targets, or numbers. NO toxic positivity. Do not mention adherence percentages or missed sessions. Lead with the person, not the programme. One or two sentences, British English, warm and specific where the data allows, and easy to reply to.

Return ONLY valid JSON — no preamble, no markdown fences — matching exactly:
{
  "risk_level": "one of: high | moderate | low",
  "diagnosis": "1-2 sentences for the coach: why this client is slipping, grounded in the data",
  "why_now": "the single clearest trigger to act on (e.g. '5 days silent after a strong start')",
  "draft_message": "the WhatsApp message to send — 1 to 2 sentences, no guilt, no plan-talk"
}`;

  let aiText = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: dataBlock }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[at-risk] anthropic error', res.status, errText);
      return NextResponse.json({ error: 'Draft generation failed.', detail: res.status }, { status: 502 });
    }
    const json = await res.json();
    aiText = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (err) {
    console.error('[at-risk] anthropic call threw', err);
    return NextResponse.json({ error: 'Draft generation failed.' }, { status: 502 });
  }

  let draft;
  try {
    const cleaned = aiText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    draft = JSON.parse(s >= 0 && e >= 0 ? cleaned.slice(s, e + 1) : cleaned);
  } catch {
    draft = { risk_level: 'moderate', diagnosis: aiText || 'Could not parse the draft.', why_now: '', draft_message: '' };
  }

  return NextResponse.json(
    {
      client: { id: client.id, name: client.name, goal: client.goal || null },
      signals: {
        days_silent,
        adherence_pct,
        slip_days,
        days_logged,
        last_activity: lastActivityISO ? lastActivityISO.slice(0, 10) : null,
        broken_pacts,
      },
      generated_at: new Date().toISOString(),
      risk_level: draft.risk_level || 'moderate',
      diagnosis: draft.diagnosis || '',
      why_now: draft.why_now || '',
      draft_message: draft.draft_message || '',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(req, context) {
  noStore();
  try {
    const params = await context.params;
    return await generate(params?.clientId);
  } catch (err) {
    console.error('[at-risk] GET threw', err);
    return NextResponse.json({ error: err?.message || 'At-risk draft failed.' }, { status: 500 });
  }
}

export async function POST(req, context) {
  noStore();
  try {
    const params = await context.params;
    return await generate(params?.clientId);
  } catch (err) {
    console.error('[at-risk] POST threw', err);
    return NextResponse.json({ error: err?.message || 'At-risk draft failed.' }, { status: 500 });
  }
}
