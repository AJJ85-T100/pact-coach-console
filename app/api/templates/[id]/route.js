/**
 * /api/templates/[id] — single-template read + update for the template
 * editor (/dashboard/templates/[id]).
 *
 * GET    — { template: { id, name, weeks, notes, sessions, updated_at } }
 * PATCH  — body { name?, weeks?, notes?, sessions? } → { ok: true }
 *
 * Ownership-checked. Edits touch ONLY the template snapshot — programmes
 * already expanded from it are independent copies (fork semantics kept).
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';
import { requireCoach } from '@/lib/auth/requireCoach';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };

function num(v) {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sanitizeExercise(e, si, ei) {
  const name = String(e?.name || '').trim().slice(0, 120);
  if (!name) throw new Error(`session ${si + 1}, exercise ${ei + 1}: needs a name`);
  const out = {
    id: typeof e?.id === 'string' && e.id ? e.id : crypto.randomUUID(),
    name,
  };
  const notes = e?.notes ? String(e.notes).trim().slice(0, 500) : undefined;

  if (e?.mode === 'cardio') {
    out.mode = 'cardio';
    const mins = num(e.duration_minutes);
    if (mins != null) out.duration_minutes = Math.max(1, Math.min(600, Math.round(mins)));
    if (e.target_hr) out.target_hr = String(e.target_hr).trim().slice(0, 40);
  } else {
    const sets = num(e.sets);
    if (sets == null || sets < 1 || sets > 20) {
      throw new Error(`session ${si + 1}, "${name}": sets must be 1-20`);
    }
    out.sets = Math.round(sets);
    const reps = num(e.reps), rmin = num(e.reps_min), rmax = num(e.reps_max);
    if (rmin != null && rmax != null && rmax >= rmin) {
      out.reps_min = Math.round(rmin);
      out.reps_max = Math.round(rmax);
    } else if (reps != null) {
      out.reps = Math.round(reps);
    } else if (rmin != null) {
      out.reps = Math.round(rmin);
    } else {
      throw new Error(`session ${si + 1}, "${name}": needs reps (or a min-max range)`);
    }
    if (e.load != null && e.load !== '') out.load = String(e.load).trim().slice(0, 40);
    if (e.tempo) out.tempo = String(e.tempo).trim().slice(0, 20);
    const rest = num(e.rest_seconds);
    if (rest != null) out.rest_seconds = Math.max(0, Math.min(900, Math.round(rest)));
    const rpe = num(e.rpe);
    if (rpe != null) out.rpe = Math.max(1, Math.min(10, rpe));
  }
  if (notes) out.notes = notes;
  return out;
}

function sanitizeSessions(input) {
  if (!Array.isArray(input)) throw new Error('sessions must be an array');
  if (input.length === 0) throw new Error('a template needs at least one session');
  if (input.length > 200) throw new Error('too many sessions (max 200)');

  return input.map((s, i) => {
    const week = Number(s?.week);
    if (!Number.isInteger(week) || week < 1 || week > 52) {
      throw new Error(`session ${i + 1}: week must be 1-52`);
    }
    let day_index = s?.day_index == null ? null : Number(s.day_index);
    if (day_index != null && (!Number.isInteger(day_index) || day_index < 1 || day_index > 7)) {
      throw new Error(`session ${i + 1}: day_index must be 1 (Mon) to 7 (Sun)`);
    }
    const name = String(s?.name || '').trim().slice(0, 120);
    if (!name) throw new Error(`session ${i + 1}: needs a name`);
    const notes = s?.notes ? String(s.notes).trim().slice(0, 1000) : undefined;

    const exercises = Array.isArray(s?.exercises) ? s.exercises : [];
    if (exercises.length === 0) throw new Error(`session ${i + 1} ("${name}"): needs at least one exercise`);
    if (exercises.length > 40) throw new Error(`session ${i + 1}: too many exercises`);

    const out = { week, name, exercises: exercises.map((e, j) => sanitizeExercise(e, i, j)) };
    if (day_index != null) out.day_index = day_index;
    if (notes) out.notes = notes;
    return out;
  });
}

async function loadOwnedTemplate(ptId, id) {
  const { data, error } = await supabase
    .from('program_templates')
    .select('id, pt_id, name, weeks, notes, sessions, updated_at')
    .eq('id', id)
    .single();
  if (error || !data) return { fail: NextResponse.json({ error: 'Template not found.' }, { status: 404 }) };
  if (data.pt_id !== ptId) return { fail: NextResponse.json({ error: 'Not yours.' }, { status: 403 }) };
  return { data };
}

export async function GET(request, { params }) {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const res = await loadOwnedTemplate(coach.pt.id, params.id);
  if (res.fail) return res.fail;

  const { pt_id, ...template } = res.data;
  return NextResponse.json({ template }, { headers: noStoreHeaders });
}

export async function PATCH(request, { params }) {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const res = await loadOwnedTemplate(coach.pt.id, params.id);
  if (res.fail) return res.fail;

  let body;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Bad request body.' }, { status: 400 });
  }

  const patch = {};
  try {
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 120);
      if (!name) throw new Error('Template needs a name.');
      patch.name = name;
    }
    if (body.weeks !== undefined) {
      const w = Number(body.weeks);
      if (!Number.isInteger(w) || w < 1 || w > 52) throw new Error('Weeks must be 1-52.');
      patch.weeks = w;
    }
    if (body.notes !== undefined) {
      patch.notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;
    }
    if (body.sessions !== undefined) {
      patch.sessions = sanitizeSessions(body.sessions);
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('program_templates')
    .update(patch)
    .eq('id', params.id)
    .eq('pt_id', coach.pt.id);

  if (error) {
    console.error('[templates:id] PATCH failed', error);
    return NextResponse.json({ error: 'Could not save the template.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
