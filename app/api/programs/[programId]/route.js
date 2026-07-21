/**
 * /api/programs/[programId]
 *
 * GET   — Load a program with all its sessions, plus minimal client info
 *         for the editor page breadcrumb.
 *
 * PATCH — Update program metadata and/or status. When activating, auto-
 *         archives any other active programmes for the same client so
 *         "active" means exactly one current programme per athlete.
 *
 * DELETE — Permanently remove a programme and all of its sessions.
 *
 * Sessions are sorted by week_number then day_index so the editor renders
 * them in training order without needing to sort client-side.
 *
 * Uses the shared no-cache admin client (lib/supabase/admin.js) so the
 * fetch cache doesn't return stale data after PATCH writes.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireProgramAccess } from '@/lib/auth/requireCoach';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET
// ============================================================================
export async function GET(_req, context) {
  noStore();
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  const access = await requireProgramAccess(programId);
  if (access.error) return access.error;


  const [programRes, sessionsRes] = await Promise.all([
    supabase
      .from('programs')
      .select('*')
      .eq('id', programId)
      .maybeSingle(),
    supabase
      .from('program_sessions')
      .select('*')
      .eq('program_id', programId)
      .order('week_number', { ascending: true })
      .order('day_index', { ascending: true }),
  ]);

  if (programRes.error) {
    console.error('[program] load failed', programRes.error);
    return NextResponse.json({ error: 'Could not load program.' }, { status: 500 });
  }
  if (!programRes.data) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }
  if (sessionsRes.error) {
    console.error('[sessions] load failed', sessionsRes.error);
    return NextResponse.json({ error: 'Could not load sessions.' }, { status: 500 });
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, equipment_list')
    .eq('id', programRes.data.client_id)
    .maybeSingle();

  return NextResponse.json(
    {
      program: programRes.data,
      sessions: sessionsRes.data || [],
      client: client || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}

// ============================================================================
// PATCH — update metadata and/or status
// ============================================================================
export async function PATCH(req, context) {
  noStore();
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  const access = await requireProgramAccess(programId);
  if (access.error) return access.error;


  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // Build patch payload — only include keys the caller explicitly provided
  const patch = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.weeks !== undefined) {
    if (body.weeks === null || body.weeks === '') {
      patch.weeks = null;
    } else {
      const weeks = Number(body.weeks);
      if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
        return NextResponse.json({ error: 'Weeks must be between 1 and 52.' }, { status: 400 });
      }
      patch.weeks = Math.floor(weeks);
    }
  }

  if (body.start_date !== undefined) {
    patch.start_date = body.start_date || null;
  }

  if (body.notes !== undefined) {
    patch.notes = body.notes ? String(body.notes).trim() || null : null;
  }

  if (body.status !== undefined) {
    if (!['draft', 'active', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: 'Status must be draft, active, or archived.' }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  // If activating, auto-archive any other active programmes for the same client
  // so "active" guarantees a single current programme per athlete.
  let autoArchivedCount = 0;
  if (patch.status === 'active') {
    const { data: current } = await supabase
      .from('programs')
      .select('client_id')
      .eq('id', programId)
      .maybeSingle();

    if (current?.client_id) {
      const { data: archived, error: archiveErr } = await supabase
        .from('programs')
        .update({ status: 'archived' })
        .eq('client_id', current.client_id)
        .eq('status', 'active')
        .neq('id', programId)
        .select('id');

      if (archiveErr) {
        console.error('[program] auto-archive failed', archiveErr);
        return NextResponse.json({ error: 'Could not archive previous active programme.' }, { status: 500 });
      }
      autoArchivedCount = archived?.length || 0;
    }
  }

  const { data, error } = await supabase
    .from('programs')
    .update(patch)
    .eq('id', programId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[program] update failed', error);
    return NextResponse.json({ error: 'Could not update programme.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Programme not found.' }, { status: 404 });
  }

  // On activation, materialize the plan into dated `programme` rows — the
  // table PAX's brain reads (morning briefs, yesterday memory, session
  // completion, pact integrity). This is the bridge that makes the coach's
  // programme the one PAX actually delivers.
  let materialized = null;
  if (patch.status === 'active') {
    materialized = await materializeProgramme(data);
  }

  return NextResponse.json(
    {
      program: data,
      autoArchivedCount,
      materialized,
    },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}

// ============================================================================
// materializeProgramme — expand an activated program into dated rows in the
// bot's `programme` table.
//
// Date mapping: sessions are indexed by (week_number, day_index) with no
// weekday attached, so each week's sessions are spread across sensible
// training-day slots (offsets from that week's Monday). The base week is the
// week containing start_date (today when start_date is unset).
//
// Only FUTURE rows are replaced (date >= today) — past `programme` rows are
// history (completion flags feed pact integrity) and are never touched.
// ============================================================================
const SLOT_PRESETS = {
  1: [0],                  // Mon
  2: [0, 3],               // Mon Thu
  3: [0, 2, 4],            // Mon Wed Fri
  4: [0, 1, 3, 4],         // Mon Tue Thu Fri
  5: [0, 1, 2, 3, 4],      // Mon–Fri
  6: [0, 1, 2, 3, 4, 5],   // Mon–Sat
  7: [0, 1, 2, 3, 4, 5, 6],
};

async function materializeProgramme(program) {
  try {
    const { data: sessions, error } = await supabase
      .from('program_sessions')
      .select('name, week_number, day_index, exercises, notes')
      .eq('program_id', program.id)
      .order('week_number', { ascending: true })
      .order('day_index', { ascending: true });

    if (error) {
      console.error('[materialize] sessions load failed', error);
      return { rows: 0, error: 'Could not load sessions.' };
    }
    if (!sessions?.length) return { rows: 0 };

    // Monday of the week containing start_date (or today when unset).
    const base = program.start_date
      ? new Date(`${program.start_date}T00:00:00Z`)
      : new Date();
    const monday = new Date(base);
    monday.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));

    const byWeek = new Map();
    for (const s of sessions) {
      const wk = s.week_number || 1;
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk).push(s);
    }

    const rows = [];
    for (const [week, list] of byWeek) {
      const slots = SLOT_PRESETS[Math.min(list.length, 7)] || SLOT_PRESETS[7];
      list.forEach((s, i) => {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + (week - 1) * 7 + slots[Math.min(i, slots.length - 1)]);
        rows.push({
          client_id:    program.client_id,
          date:         d.toISOString().split('T')[0],
          week_number:  week,
          session_name: s.name,
          is_rest:      false,
          exercises:    Array.isArray(s.exercises) ? s.exercises : [],
          notes:        s.notes || '',
        });
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const future = rows.filter((r) => r.date >= today);
    if (!future.length) return { rows: 0 };

    const { error: delErr } = await supabase
      .from('programme')
      .delete()
      .eq('client_id', program.client_id)
      .gte('date', today);
    if (delErr) {
      console.error('[materialize] delete failed', delErr);
      return { rows: 0, error: 'Could not clear future rows.' };
    }

    const { error: insErr } = await supabase.from('programme').insert(future);
    if (insErr) {
      console.error('[materialize] insert failed', insErr);
      return { rows: 0, error: 'Could not insert rows.' };
    }

    console.log(`[materialize] ${future.length} dated rows written for client ${program.client_id} (${program.name})`);
    return { rows: future.length };
  } catch (err) {
    console.error('[materialize] unexpected', err);
    return { rows: 0, error: 'Unexpected error.' };
  }
}

// ============================================================================
// DELETE — remove a programme and all of its sessions
// ============================================================================
export async function DELETE(_req, context) {
  noStore();
  const params = await context.params;
  const programId = params?.programId;

  if (!programId || typeof programId !== 'string') {
    return NextResponse.json({ error: 'programId required.' }, { status: 400 });
  }

  const access = await requireProgramAccess(programId);
  if (access.error) return access.error;


  // Confirm it exists first so we can return a clean 404 rather than a silent no-op.
  const { data: existing, error: findErr } = await supabase
    .from('programs')
    .select('id')
    .eq('id', programId)
    .maybeSingle();

  if (findErr) {
    console.error('[program] delete lookup failed', findErr);
    return NextResponse.json({ error: 'Could not delete programme.' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Programme not found.' }, { status: 404 });
  }

  // Remove child sessions first so we don't depend on a DB cascade being declared,
  // then the programme itself.
  const { error: sessErr } = await supabase
    .from('program_sessions')
    .delete()
    .eq('program_id', programId);

  if (sessErr) {
    console.error('[program] session delete failed', sessErr);
    return NextResponse.json({ error: 'Could not delete programme sessions.' }, { status: 500 });
  }

  const { error: progErr } = await supabase
    .from('programs')
    .delete()
    .eq('id', programId);

  if (progErr) {
    console.error('[program] delete failed', progErr);
    return NextResponse.json({ error: 'Could not delete programme.' }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}
