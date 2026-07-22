/**
 * lib/programs/materialize.js
 *
 * Shared materializer: expands a program's sessions into dated rows in the
 * bot's `programme` table — the table PAX's whole brain reads (morning briefs,
 * yesterday memory, session completion, pact integrity).
 *
 * Used in two places:
 *   1. Activation (PATCH /api/programs/[programId] with status:'active').
 *   2. Auto-rematerialize: every session/exercise write to an ACTIVE programme
 *      re-runs it, so edits reach the athlete and PAX immediately instead of
 *      silently waiting for a manual re-activation.
 *
 * Date mapping: day_index is the weekday the coach picked in the editor
 * (1 = Mon … 7 = Sun), so each session lands on its actual chosen day. The
 * base week is the week containing start_date (today when start_date is
 * unset). Sessions missing a day_index fall back to sensible training-day
 * slots spread across the week (the pre-weekday legacy behaviour).
 *
 * Only FUTURE rows are replaced (date >= today) — past `programme` rows are
 * history (completion flags feed pact integrity) and are never touched.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

const SLOT_PRESETS = {
  1: [0],                  // Mon
  2: [0, 3],               // Mon Thu
  3: [0, 2, 4],            // Mon Wed Fri
  4: [0, 1, 3, 4],         // Mon Tue Thu Fri
  5: [0, 1, 2, 3, 4],      // Mon–Fri
  6: [0, 1, 2, 3, 4, 5],   // Mon–Sat
  7: [0, 1, 2, 3, 4, 5, 6],
};

export async function materializeProgramme(program) {
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
        // Honour the coach-chosen weekday when set; fall back to spread slots.
        const dayIdx = Number(s.day_index);
        const offset = Number.isFinite(dayIdx) && dayIdx >= 1 && dayIdx <= 7
          ? dayIdx - 1
          : slots[Math.min(i, slots.length - 1)];
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() + (week - 1) * 7 + offset);
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

/**
 * Re-run the materializer for a programme IF it is currently active, so
 * session/exercise edits reach the athlete and PAX immediately. Non-fatal by
 * design — callers must never fail their own write because this didn't run.
 *
 * Returns { active, rows } — active:false means the programme is a draft or
 * archived (nothing to push), rows is how many dated rows were rewritten.
 */
export async function rematerializeIfActive(programId) {
  try {
    if (!programId) return { active: false, rows: 0 };
    const { data: program } = await supabase
      .from('programs')
      .select('id, client_id, name, start_date, status')
      .eq('id', programId)
      .maybeSingle();
    if (!program || program.status !== 'active') return { active: false, rows: 0 };
    const result = await materializeProgramme(program);
    return { active: true, rows: result?.rows || 0 };
  } catch (err) {
    console.error('[rematerialize] failed (non-fatal)', err);
    return { active: false, rows: 0 };
  }
}
