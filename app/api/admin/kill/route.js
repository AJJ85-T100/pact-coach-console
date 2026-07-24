// POST /api/admin/kill  { disabled: true|false }
// Flips the DB-backed global kill switch the bot's proactiveAllowed() reads.
// Takes effect within 60s (bot-side cache).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function POST(request) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body = {};
  try { body = await request.json(); } catch {}
  if (typeof body.disabled !== 'boolean') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = db();
  const { error } = await supabase.from('platform_settings')
    .update({
      sends_disabled: body.disabled,
      updated_at: new Date().toISOString(),
      updated_by: 'admin',
    })
    .eq('id', 1);
  if (error) {
    console.error('[admin/kill]', error.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  const { error: evErr } = await supabase.from('moderation_events').insert({
    actor: 'admin',
    action: body.disabled ? 'global_kill_on' : 'global_kill_off',
  });
  if (evErr) console.error('[admin/kill] audit insert failed:', evErr.message);

  return NextResponse.json({ ok: true, sends_disabled: body.disabled });
}
