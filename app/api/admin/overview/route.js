// GET /api/admin/overview → dashboard stats + kill state + audit feed, one call
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

// ADAPTATION NOTE: if the console already exports a service-role client,
// import that instead and delete this factory.
function db() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const supabase = db();

  const [stats, settings, events] = await Promise.all([
    supabase.rpc('admin_dashboard'),
    supabase.from('platform_settings').select('*').eq('id', 1).single(),
    supabase.from('moderation_events')
      .select('id, client_id, pt_id, actor, action, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const firstErr = stats.error || settings.error || events.error;
  if (firstErr) {
    console.error('[admin/overview]', firstErr.message);
    return NextResponse.json({ error: 'Could not load data' }, { status: 500 });
  }

  const d = stats.data || {};
  return NextResponse.json({
    platform: d.platform || {},
    daily: d.daily || [],
    coaches: d.coaches || [],
    clients: d.clients || [],
    sends_disabled: !!settings.data?.sends_disabled,
    events: events.data || [],
  });
}
