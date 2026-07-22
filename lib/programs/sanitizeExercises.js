/**
 * lib/programs/sanitizeExercises.js
 *
 * Shared sanitizer for the exercises JSONB array on program_sessions.
 * Used by the session PATCH route (exercise edits) and the session POST
 * route (duplicate-session / copy-week create sessions with exercises).
 */

export function sanitizeExercises(exercises) {
  return exercises
    .filter((e) => e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim())
    .map((e, i) => {
      const sets       = toIntOrNull(e.sets, 1, 20);
      const repsMin    = toIntOrNull(e.reps_min, 1, 100);
      const repsMax    = toIntOrNull(e.reps_max, 1, 100);
      const rpe        = toFloatOrNull(e.rpe, 1, 10);
      const restSecs   = toIntOrNull(e.rest_seconds, 0, 1800);

      return {
        id: typeof e.id === 'string' && e.id ? e.id : `ex-${Date.now()}-${i}`,
        name: e.name.trim(),
        // Cardio prescription (assault bike, rower, treadmill…): time, calories
        // and/or target heart rate instead of sets × reps × weight.
        mode: e.mode === 'cardio' ? 'cardio' : null,
        time_min:    toIntOrNull(e.time_min, 1, 600),
        target_cals: toIntOrNull(e.target_cals, 1, 5000),
        target_hr:   toIntOrNull(e.target_hr, 60, 220),
        sets,
        reps_min: repsMin,
        reps_max: repsMax,
        weight: typeof e.weight === 'string' ? e.weight.trim() || null : null,
        rpe,
        rest_seconds: restSecs,
        tempo: typeof e.tempo === 'string' ? e.tempo.trim() || null : null,
        notes: typeof e.notes === 'string' ? e.notes.trim() || null : null,
        video_url: typeof e.video_url === 'string' && /^https?:\/\//.test(e.video_url.trim())
          ? e.video_url.trim().slice(0, 500) : null,
        equipment_needed: Array.isArray(e.equipment_needed)
          ? e.equipment_needed.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
          : [],
      };
    });
}

function toIntOrNull(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toFloatOrNull(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
