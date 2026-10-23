/**
 * Everything PACT holds about one athlete: the single table list behind the
 * coach-side delete (app/api/clients/[clientId]/route.js) and export
 * (app/api/clients/[clientId]/export/route.js).
 *
 * MIRRORS the engine's engine/src/domain/athleteData.ts in AJJ85-T100/fitness-coach-bot
 * (CLIENT_TABLES, INTERVENTION_TABLES, REDACT and the photo bucket name).
 * When a table is added there, add it here in the same place and run
 *   node scripts/check-erase-list.mjs
 * which fails if the two lists differ. scripts/check-erase-list.mjs reads the
 * arrays below, so keep them plain string literals, one `const` each.
 */

/** Tables keyed directly by client_id, in erase order (FK children first). */
export const CLIENT_TABLES = [
  // Workout chain: form_clips → set_logs → workout_logs.
  'form_clips', 'set_logs', 'workout_logs',
  // V2 engine. intervention_outcomes and coach_labels hang off interventions; llm_calls points at them too.
  'llm_calls', 'interventions', 'athlete_events', 'athlete_state_daily', 'consents', 'push_tokens', 'brief_claims', 'scheduled_sends',
  // Chat, plan, pacts, health.
  'conversations', 'client_memory', 'health_data', 'weigh_ins', 'mood_ratings', 'activities', 'lift_history',
  'daily_pacts', 'pact_witnesses', 'custom_pacts', 'weekly_pacts', 'weekend_pacts', 'pact_checkins', 'win_stack', 'milestones', 'slip_events',
  'stakes', 'cosigners', 'coach_meetings', 'coach_notes', 'appointments', 'programme', 'calendar_days', 'terra_connections',
  'notifications', 'weekly_checkins', 'checkin_photos',
];

/** Tables keyed by intervention_id. */
export const INTERVENTION_TABLES = ['intervention_outcomes', 'coach_labels'];

/** Columns never exported: working credentials, not personal data. */
export const REDACT = ['console_token', 'wa_api_key', 'refresh_token', 'access_token', 'telegram_link_code'];

/** Private bucket holding the progress photos, object path <client_id>/<week_start>/<pose>.<ext>. */
export const PHOTO_BUCKET = 'checkin-photos';

/** Links to photos in an export last an hour, as in the engine's athlete export. */
export const EXPORT_PHOTO_EXPIRY_S = 60 * 60;

// 42P01 = Postgres; PGRST205 = newer PostgREST "could not find the table".
export const isMissing = (e) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));
