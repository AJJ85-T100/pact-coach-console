/**
 * /api/reports/[clientId]
 *
 * Generates a PAX weekly report (the Sunday wrap) for one client. Looks at the
 * last 7 days of pacts, custom-pact streaks, the WhatsApp conversation, and the
 * active programme, compares this week's adherence to the previous 7 days so the
 * momentum read is grounded, and asks PAX (Claude) for a structured retro:
 * a headline, a momentum label, what worked, what to watch, and the single focus
 * for next week.
 *
 * GET and POST both generate. Read-only. Requires ANTHROPIC_API_KEY.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';
const DAY = 86400000;

function adherence(rows) {
  const wins = rows.reduce((a, d) => a + (d.wins_completed || 0), 0);
  const total = rows.reduce((a, d) => a + (d.total_wins || 0), 0);
  return { wins, total, pct: total > 0 ? Math.round((wins / total) * 100) : null };
}

async function generate(clientId, weeksAgo = 0) {
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
    console.error('[report] client load failed', clientErr);
    return NextResponse.json({ error: 'Could not load client.' }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }

  const now = Date.now();
  const end = now - weeksAgo * 7 * DAY;
  const thisStartISO = new Date(end - 7 * DAY).toISOString();
  const thisEndISO = new Date(end).toISOString();
  const prevStartISO = new Date(end - 14 * DAY).toISOString();
  const thisStartDate = thisStartISO.slice(0, 10);
  const thisEndDate = thisEndISO.slice(0, 10);
  const prevStartDate = prevStartISO.slice(0, 10);
  const histStartDate = new Date(end - 56 * DAY).toISOString().slice(0, 10);

  // --- Data (parallel) ---
  const [thisRes, prevRes, customRes, convRes, progRes, histRes] = await Promise.all([
    supabase.from('daily_pacts')
      .select('date, wins_completed, total_wins, status, impact_message')
      .eq('client_id', clientId).gt('date', thisStartDate).lte('date', thisEndDate).order('date', { ascending: true }),
    supabase.from('daily_pacts')
      .select('wins_completed, total_wins')
      .eq('client_id', clientId).gt('date', prevStartDate).lte('date', thisStartDate),
    supabase.from('custom_pacts')
      .select('name, rule, current_streak, longest_streak, last_broken_date, status')
      .eq('client_id', clientId),
    supabase.from('conversations')
      .select('role, content, created_at')
      .eq('client_id', clientId).gt('created_at', thisStartISO).lte('created_at', thisEndISO)
      .order('created_at', { ascending: true }).limit(60),
    supabase.from('programs')
      .select('id, name, weeks, status').eq('client_id', clientId).eq('status', 'active').limit(1),
    supabase.from('daily_pacts')
      .select('date, wins_completed, total_wins')
      .eq('client_id', clientId).gt('date', histStartDate).lte('date', thisEndDate).order('date', { ascending: true }),
  ]);

  const thisWeek = thisRes.data || [];
  const adhThis = adherence(thisWeek);
  const adhPrev = adherence(prevRes.data || []);
  const delta = adhThis.pct != null && adhPrev.pct != null ? adhThis.pct - adhPrev.pct : null;
  const daysLogged = thisWeek.length;
  const slipDays = thisWeek.filter((d) => (d.status && d.status !== 'kept') || (d.total_wins && d.wins_completed < d.total_wins)).length;
  const topStreak = (customRes.data || []).reduce((m, p) => Math.max(m, p.current_streak || 0), 0);

  // 8-week adherence history, oldest → newest (newest = current window).
  const histRows = histRes.data || [];
  const WEEKS = 8;
  const history = [];
  for (let i = 0; i < WEEKS; i++) {
    const wEndMs = end - (WEEKS - 1 - i) * 7 * DAY;
    const wStart = new Date(wEndMs - 7 * DAY).toISOString().slice(0, 10);
    const wEnd = new Date(wEndMs).toISOString().slice(0, 10);
    const rows = histRows.filter((r) => r.date > wStart && r.date <= wEnd);
    history.push({ week_start: wStart, pct: adherence(rows).pct, days: rows.length });
  }

  const customPacts = (customRes.data || [])
    .map((p) => `${p.name} (${p.rule}) — streak ${p.current_streak ?? 0}, status ${p.status || 'active'}`)
    .join('\n');

  const convo = (convRes.data || [])
    .slice(-40)
    .map((m) => `${m.role === 'assistant' ? 'PAX' : 'Client'}: ${String(m.content || '').slice(0, 280)}`)
    .join('\n');

  const activeProgram = progRes.data?.[0] || null;

  const dataBlock = `CLIENT
Name: ${client.name || 'Unknown'}
Goal: ${client.goal || client.goal_text || 'Not recorded'}
Current weight: ${client.current_weight ?? 'n/a'} · Target: ${client.target_weight ?? 'n/a'}
Active programme: ${activeProgram ? `${activeProgram.name} (${activeProgram.weeks || '?'} wks)` : 'None'}

THIS WEEK (last 7 days)
Days logged: ${daysLogged} · Pacts kept: ${adhThis.wins}/${adhThis.total} · Adherence: ${adhThis.pct ?? 'n/a'}% · Slip days: ${slipDays}

LAST WEEK (days 8-14)
Adherence: ${adhPrev.pct ?? 'n/a'}%
Week-on-week change: ${delta == null ? 'n/a' : `${delta > 0 ? '+' : ''}${delta} points`}

CUSTOM PACTS
${customPacts || 'None'}

CONVERSATION THIS WEEK
${convo || 'No messages this week.'}`;

  const systemPrompt = `You are PAX, the AI accountability companion inside PACT.Health. Write this client's WEEKLY REPORT for their coach — the Sunday wrap they read before planning next week. Tell the coach the story of the week and what to do about it.

Ground every statement in the supplied data. Never invent numbers or events. If data is thin, say so plainly. Use the conversation to explain WHY adherence moved, not just that it did — the human reason is the most useful thing here. Pay particular attention to stalled or slipping momentum: that is where clients quietly drop off. British English, direct, specific, no fitness clichés, no toxic positivity.

Return ONLY valid JSON — no preamble, no markdown fences — matching exactly:
{
  "headline": "a short, punchy one-liner for the week (e.g. 'Strongest week yet', 'Momentum is stalling', 'Re-engagement needed')",
  "momentum": "one of: building | steady | slipping | stalled",
  "what_worked": ["1-3 concrete wins from the week"],
  "what_to_watch": ["0-3 things slipping or worth watching, most important first"],
  "recommendation": "one short paragraph: the single most important focus for next week"
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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: dataBlock }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[report] anthropic error', res.status, errText);
      return NextResponse.json({ error: 'Report generation failed.', detail: res.status }, { status: 502 });
    }
    const json = await res.json();
    aiText = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (err) {
    console.error('[report] anthropic call threw', err);
    return NextResponse.json({ error: 'Report generation failed.' }, { status: 502 });
  }

  let report;
  try {
    const cleaned = aiText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    report = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    report = { headline: 'Report unavailable', momentum: 'steady', what_worked: [], what_to_watch: [], recommendation: aiText || 'Could not parse report.' };
  }

  return NextResponse.json(
    {
      client: { id: client.id, name: client.name },
      window: { days: 7, from: thisStartDate, to: thisEndDate, weeks_ago: weeksAgo },
      stats: {
        adherence_pct: adhThis.pct,
        prev_adherence_pct: adhPrev.pct,
        delta,
        wins: adhThis.wins,
        win_total: adhThis.total,
        days_logged: daysLogged,
        slip_days: slipDays,
        top_streak: topStreak,
      },
      generated_at: new Date().toISOString(),
      history,
      report,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}

export async function GET(req, context) {
  noStore();
  const params = await context.params;
  const weeksAgo = Math.max(0, parseInt(new URL(req.url).searchParams.get('weeks_ago') || '0', 10) || 0);
  return generate(params?.clientId, weeksAgo);
}

export async function POST(req, context) {
  noStore();
  const params = await context.params;
  const weeksAgo = Math.max(0, parseInt(new URL(req.url).searchParams.get('weeks_ago') || '0', 10) || 0);
  return generate(params?.clientId, weeksAgo);
}
