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
 * (lib/athleteData.js, which mirrors the engine's athleteData.ts). Add a
 * table there and both pick it up — they are two views of the same question:
 * everything we hold about this person.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';
import { tokenMatchesClient } from '@/lib/auth/requireCoach';
import { CLIENT_TABLES, INTERVENTION_TABLES, REDACT, PHOTO_BUCKET, EXPORT_PHOTO_EXPIRY_S, isMissing } from '@/lib/athleteData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Tables come from lib/athleteData.js, the same list the erase route removes
// (and a mirror of the engine's athleteData.ts). Workout chain rows are in it too.
const REDACT_SET = new Set(REDACT);

function scrub(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r || {})) if (!REDACT_SET.has(k)) out[k] = v;
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
        'To correct any of this, contact hello@pact.healthcare or your coach. In the PACT app, Settings → Your data → Delete my account erases it. ' +
        'Erasure removes every section below, the stored form-check videos, the check-in progress photos and your sign-in.',
    },
    profile: scrub([client])[0],
  };

  // Sequential rather than parallel: this runs rarely, and a burst of 40
  // concurrent queries against the pooler is a worse trade than a few
  // extra seconds.
  const missing = [];
  for (const table of CLIENT_TABLES) {
    const { data, error } = await supabase.from(table).select('*').eq('client_id', clientId);
    if (error) {
      if (isMissing(error)) { missing.push(table); continue; } // not on this deployment
      console.error(`[export] ${table}:`, error.message);
      bundle[table] = { error: 'could not be read' };
      continue;
    }
    bundle[table] = scrub(data || []);
  }

  const interventionIds = (Array.isArray(bundle.interventions) ? bundle.interventions : []).map((r) => r.id).filter(Boolean);
  for (const table of INTERVENTION_TABLES) {
    if (!interventionIds.length) { bundle[table] = []; continue; }
    const { data, error } = await supabase.from(table).select('*').in('intervention_id', interventionIds);
    if (error) {
      if (isMissing(error)) { missing.push(table); continue; }
      console.error(`[export] ${table}:`, error.message);
      bundle[table] = { error: 'could not be read' };
      continue;
    }
    bundle[table] = scrub(data || []);
  }

  // programs are keyed by client_id; program_sessions hang off programs.
  {
    const { data, error } = await supabase.from('programs').select('*').eq('client_id', clientId);
    if (error && isMissing(error)) missing.push('programs');
    else if (error) { console.error('[export] programs:', error.message); bundle.programs = { error: 'could not be read' }; }
    else bundle.programs = scrub(data || []);
  }
  const programIds = (Array.isArray(bundle.programs) ? bundle.programs : []).map((p) => p.id).filter(Boolean);
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

  // The progress photos themselves: links that work for an hour, one per pose per week
  // (as in the athlete's own export). The bucket is private.
  const photoRows = Array.isArray(bundle.checkin_photos) ? bundle.checkin_photos : [];
  const paths = photoRows.map((r) => r.storage_path).filter(Boolean);
  const signed = new Map();
  if (paths.length) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, EXPORT_PHOTO_EXPIRY_S);
    if (error) console.error('[export] checkin photo links:', error.message);
    for (const d of data || []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  bundle.checkin_photo_links = photoRows
    .filter((r) => signed.has(r.storage_path))
    .map((r) => ({
      week_start: r.week_start,
      pose: r.pose,
      taken: r.taken_at ? String(r.taken_at).slice(0, 10) : r.week_start,
      url: signed.get(r.storage_path),
      expires_in_seconds: EXPORT_PHOTO_EXPIRY_S,
    }));

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
