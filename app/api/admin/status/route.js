// POST /api/admin/status  { kind:'client'|'coach', id, status, reason? }
// Sets the status flag and writes the moderation_events audit row atomically
// enough for pilot scale (two sequential writes; event insert failure is logged
// but does not roll back the status change).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

const KINDS = { client: 'clients', coach: 'personal_trainers' };
const STATUSES = new Set(['active', 'paused', 'blocked']);

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
  const { kind, id, status, reason } = body;

  if (!KINDS[kind] || !id || !STATUSES.has(status)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const supabase = db();
  const { error: upErr } = await supabase
    .from(KINDS[kind])
    .update({ status })
    .eq('id', id);
  if (upErr) {
    console.error('[admin/status]', upErr.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  const action = status === 'active' ? 'reactivated' : status;
  const { error: evErr } = await supabase.from('moderation_events').insert({
    client_id: kind === 'client' ? id : null,
    pt_id: kind === 'coach' ? id : null,
    actor: 'admin',
    action,
    reason: reason || null,
  });
  if (evErr) console.error('[admin/status] audit insert failed:', evErr.message);

  return NextResponse.json({ ok: true });
}
