/**
 * /api/briefs/[clientId]
 *
 * Generates a pre-session brief for a coach. Gathers everything since the
 * client's last logged meeting (coach_meetings) — kept/missed pacts, custom-pact
 * streaks, the recent WhatsApp conversation, known facts, current weight and
 * injuries, plus the active programme's planned lifts — and asks PAX (Claude) to
 * return a structured brief: a since-last-met catch-up, the human "why" pulled
 * from the conversation, red flags, concrete suggested actions for today, and an
 * injury-vs-plan safety check.
 *
 * GET and POST both generate (GET is handy for a browser smoke test). Read-only.
 *
 * Requires ANTHROPIC_API_KEY in the environment.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';
const FALLBACK_DAYS = 14; // if no meeting has been logged yet

async function generate(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required.' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, { status: 500 });
  }

  // --- Client ---
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr) {
    console.error('[brief] client load failed', clientErr);
    return NextResponse.json({ error: 'Could not load client.' }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  // --- Anchor: latest logged meeting (fallback: N days ago) ---
  const { data: meetings } = await supabase
    .from('coach_meetings')
    .select('met_at, note')
    .eq('client_id', clientId)
    .order('met_at', { ascending: false })
    .limit(1);

  const lastMeeting = meetings?.[0] || null;
  const sinceISO = lastMeeting?.met_at
    || new Date(Date.now() - FALLBACK_DAYS * 86400000).toISOString();
  const sinceDate = sinceISO.slice(0, 10);

  // --- Data since the anchor (run in parallel) ---
  const [dailyRes, customRes, convRes, memRes, progRes] = await Promise.all([
    supabase.from('daily_pacts')
      .select('date, wins_completed, total_wins, status, impact_message')
      .eq('client_id', clientId).gte('date', sinceDate).order('date', { ascending: true }),
    supabase.from('custom_pacts')
      .select('name, rule, current_streak, longest_streak, last_broken_date, status')
      .eq('client_id', clientId),
    supabase.from('conversations')
      .select('role, content, created_at')
      .eq('client_id', clientId).gte('created_at', sinceISO)
      .order('created_at', { ascending: true }).limit(60),
    supabase.from('client_memory')
      .select('key, value').eq('client_id', clientId).limit(40),
    supabase.from('programs')
      .select('id, name, weeks, status').eq('client_id', clientId).eq('status', 'active').limit(1),
  ]);

  // Active programme's planned lifts (for the safety check + action suggestions)
  let planLines = [];
  const activeProgram = progRes.data?.[0] || null;
  if (activeProgram) {
    const { data: sessions } = await supabase
      .from('program_sessions')
      .select('name, week_number, day_index, exercises')
      .eq('program_id', activeProgram.id)
      .order('week_number', { ascending: true })
      .order('day_index', { ascending: true });
    for (const s of sessions || []) {
      const lifts = Array.isArray(s.exercises)
        ? s.exercises.map((e) => e?.name).filter(Boolean).join(', ')
        : '';
      planLines.push(`W${s.week_number} D${s.day_index} ${s.name}: ${lifts || '—'}`);
    }
  }

  // --- Shape the conversation: recent, bounded ---
  const convo = (convRes.data || [])
    .slice(-40)
    .map((m) => `${m.role === 'assistant' ? 'PAX' : 'Client'}: ${String(m.content || '').slice(0, 300)}`)
    .join('\n');

  // --- Adherence rollup ---
  const daily = dailyRes.data || [];
  const daysLogged = daily.length;
  const wins = daily.reduce((a, d) => a + (d.wins_completed || 0), 0);
  const winTotal = daily.reduce((a, d) => a + (d.total_wins || 0), 0);
  const slipDays = daily.filter((d) => (d.status && d.status !== 'kept') || (d.total_wins && d.wins_completed < d.total_wins)).length;

  const customPacts = (customRes.data || [])
    .map((p) => `${p.name} (${p.rule}) — streak ${p.current_streak ?? 0}, status ${p.status || 'active'}${p.last_broken_date ? `, last broken ${p.last_broken_date}` : ''}`)
    .join('\n');

  const facts = (memRes.data || [])
    .map((m) => `${m.key}: ${m.value}`)
    .join('\n');

  const injuries = client.injuries
    ? (typeof client.injuries === 'string' ? client.injuries : JSON.stringify(client.injuries))
    : 'None recorded';

  const daysSince = Math.max(0, Math.round((Date.now() - new Date(sinceISO).getTime()) / 86400000));

  // --- Glanceable stats (surfaced to the UI; no extra AI cost) ---
  const adherencePct = winTotal > 0 ? Math.round((wins / winTotal) * 100) : null;
  const topStreak = (customRes.data || []).reduce((m, p) => Math.max(m, p.current_streak || 0), 0);
  const stats = {
    adherence_pct: adherencePct,
    wins,
    win_total: winTotal,
    days_logged: daysLogged,
    slip_days: slipDays,
    top_streak: topStreak,
    custom_pacts: (customRes.data || []).length,
  };

  // --- Build the prompt ---
  const dataBlock = `CLIENT
Name: ${client.name || 'Unknown'}
Goal: ${client.goal || client.goal_text || 'Not recorded'}
Experience: ${client.experience_level || 'n/a'} · Style: ${client.training_style || 'n/a'}
Current weight: ${client.current_weight ?? 'n/a'} · Target: ${client.target_weight ?? 'n/a'}
Status: ${client.status || 'n/a'}
Injuries / niggles: ${injuries}

MEETING ANCHOR
Last met: ${lastMeeting ? `${sinceDate} (${daysSince} days ago)` : `no meeting logged — summarising the last ${FALLBACK_DAYS} days`}
${lastMeeting?.note ? `Coach note from last meeting: ${lastMeeting.note}` : ''}

PACTS SINCE THEN
Days logged: ${daysLogged} · Wins ${wins}/${winTotal} · Slip days: ${slipDays}
Custom pacts:
${customPacts || 'None'}

KNOWN FACTS (client_memory)
${facts || 'None recorded'}

ACTIVE PROGRAMME
${activeProgram ? `${activeProgram.name} (${activeProgram.weeks || '?'} wks)` : 'No active programme'}
Planned sessions:
${planLines.join('\n') || '—'}

RECENT CONVERSATION (since last meeting)
${convo || 'No messages in this window.'}`;

  const systemPrompt = `You are PAX, the AI accountability companion inside PACT.Health. You are writing a PRE-SESSION BRIEF for a personal trainer who is about to coach this client. Your job: save the coach the work of reconstructing where the client is since they last met, and tell them what to actually do today.

Ground every statement in the supplied data. Never invent numbers, sleep, or events. If the data is thin, say so plainly rather than padding. Use the conversation to surface the human "why" behind any slips, mood, or changes — that context is the most valuable thing you can give the coach. Write for the coach, not the client. British English, direct and specific, no fitness clichés, no toxic positivity.

Return ONLY valid JSON — no preamble, no markdown fences — matching exactly:
{
  "since_summary": ["short factual bullets of what's changed since the last meeting"],
  "why": "one short paragraph of human context drawn from the conversation (or 'Not enough conversation to read the why.')",
  "red_flags": ["0-3 things the coach should genuinely worry about, most important first"],
  "suggested_actions": ["1-3 concrete coaching moves for today's session"],
  "safety_check": "cross-check recorded injuries against the planned lifts; name any conflict and a substitution, or 'No conflicts seen.'"
}`;

  // --- Call Claude ---
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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: dataBlock }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[brief] anthropic error', res.status, errText);
      return NextResponse.json({ error: 'Brief generation failed.', detail: res.status }, { status: 502 });
    }

    const json = await res.json();
    aiText = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (err) {
    console.error('[brief] anthropic call threw', err);
    return NextResponse.json({ error: 'Brief generation failed.' }, { status: 502 });
  }

  // --- Parse the model's JSON defensively ---
  let brief;
  try {
    const cleaned = aiText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    brief = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    // Fall back to handing the raw text through rather than failing hard.
    brief = { since_summary: [], why: aiText || 'Could not parse brief.', red_flags: [], suggested_actions: [], safety_check: '' };
  }

  return NextResponse.json(
    {
      client: { id: client.id, name: client.name },
      since: { at: sinceISO, days_ago: daysSince, logged: !!lastMeeting, note: lastMeeting?.note || null },
      stats,
      generated_at: new Date().toISOString(),
      brief,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}

export async function GET(_req, context) {
  noStore();
  const params = await context.params;
  return generate(params?.clientId);
}

export async function POST(_req, context) {
  noStore();
  const params = await context.params;
  return generate(params?.clientId);
}
