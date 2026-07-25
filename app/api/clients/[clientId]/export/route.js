/**
 * GET /api/clients/[clientId]/export
 *
 * Everything PACT holds about one athlete, as a single JSON download.
 *
 * ⚠️ WHY THIS EXISTS (security review, data protection). There was no export
 * path anywhere in either repo — no route, no component, nothing producing a
 * Content-Disposition. terms.html promises the athlete can "ask us to delete
 * your data", and the privacy policy offers access and portability rights,
 * with no mechanism behind either. This is the mechanism for UK GDPR
 * Article 15 (right of access) and Article 20 (portability): machine-
 * readable, complete, one request.
 *
 * Access: the athlete's own invite token, or the coach who owns them.
 * A coach exporting their own athlete is a normal support action; the
 * athlete's token is what makes this a real subject-access route rather
 * than a coach convenience.
 *
 * The table list is deliberately the same set the erase route removes
 * (app/api/clients/[clientId]/route.js CHILD_TABLES). If you add a table
 * to one, add it to the other — they are two views of the same question:
 * everything we hold about this person.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';
import { tokenMatchesClient } from '@/lib/auth/requireCoach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tables keyed directly by client_id.
const BY_CLIENT_ID = [
  'conversations', 'health_data', 'daily_pacts', 'custom_pacts', 'win_stack',
  'weigh_ins', 'milestones', 'slip_events', 'mood_ratings', 'coach_meetings',
  'weekly_pacts', 'weekend_pacts', 'stakes', 'cosigners', 'client_memory',
  'programme', 'activities', 'coach_notes', 'terra_connections', 'appointments',
  'lift_history', 'pact_checkins', 'calendar_days', 'workout_logs', 'set_logs',
  'form_clips', 'programs',
];

// Columns never returned: platform credentials, not personal data, and
// exporting them would hand out a working key.
const REDACT = new Set(['console_token', 'wa_api_key', 'refresh_token', 'access_token']);

function scrub(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r || {})) if (!REDACT.has(k)) out[k] = v;
    return out;
  });
}

export async function GET(req, context) {
  noStore();
  const params = await context.params;
  const clientId = params?.clientId;
  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });

  // Coach who owns them, or the athlete's own invite token.
  const access = await requireClientAccess(clientId);
  if (access.error) {
    const t = new URL(req.url).searchParams.get('token');
    if (!(t && await tokenMatchesClient(clientId, t))) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
    }
  }

  const { data: client, error: cErr } = await supabase
    .from('clients').select('*').eq('id', clientId).maybeSingle();
  if (cErr || !client) {
    return NextResponse.json({ error: 'Could not load that athlete.' }, { status: 404 });
  }

  const bundle = {
    _about: {
      generated_at: new Date().toISOString(),
      platform: 'PACT.Health',
      subject_id: clientId,
      note:
        'Everything PACT.Health holds about this person, one section per table. ' +
        'Free-text conversations are their messages with PAX and PAX\'s replies. ' +
        'Platform credentials are excluded — they are not personal data.',
      your_rights:
        'To correct or erase any of this, contact hello@pact.healthcare or your coach. ' +
        'Erasure removes every section below, the stored form-check videos, and your sign-in.',
    },
    profile: scrub([client])[0],
  };

  // Sequential rather than parallel: this runs rarely, and a burst of 27
  // concurrent queries against the pooler is a worse trade than a few
  // extra seconds.
  const missing = [];
  for (const table of BY_CLIENT_ID) {
    const { data, error } = await supabase.from(table).select('*').eq('client_id', clientId);
    if (error) {
      if (error.code === '42P01') { missing.push(table); continue; } // not on this deployment
      console.error(`[export] ${table}:`, error.message);
      bundle[table] = { error: 'could not be read' };
      continue;
    }
    bundle[table] = scrub(data || []);
  }

  // program_sessions hangs off programs, not client_id.
  const programIds = (bundle.programs || []).map((p) => p.id).filter(Boolean);
  if (programIds.length) {
    const { data } = await supabase.from('program_sessions').select('*').in('program_id', programIds);
    bundle.program_sessions = scrub(data || []);
  } else {
    bundle.program_sessions = [];
  }

  // Calendar connection is keyed by owner_type/owner_id. Tokens are redacted.
  const { data: cal } = await supabase.from('calendar_connections')
    .select('*').eq('owner_type', 'client').eq('owner_id', clientId);
  bundle.calendar_connections = scrub(cal || []);

  if (missing.length) bundle._about.tables_not_present = missing;

  const safeName = String(client.name || 'athlete').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  const filename = `pact-data-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
