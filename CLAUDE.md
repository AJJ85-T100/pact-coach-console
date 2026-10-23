# PACT coach console (Next.js)

The coach's side of PACT. Vercel auto-deploys `main` to pact-coach-console.vercel.app. The full system picture, safety rules and how Alex likes to work are in `AJJ85-T100/fitness-coach-bot` → `CLAUDE.md`; read that first.

## V2 pieces (talk to the engine as the signed-in coach)
- `lib/engine.js`: `engineFetch(path, init)` sends the coach's own Supabase access token to the engine (`ENGINE_URL`, defaults to the workers.dev URL). The engine checks roster ownership; don't add service-role shortcuts for V2 data.
- `components/NeedsYouToday.js` (top of `app/dashboard/page.js`): escalations by urgency with the athlete's words, drafts to approve / edit / bin, drifting athletes, consent needed + send link. API proxies in `app/api/needs-you/`.
- `components/OutcomesPanel.js`: what's working, from `/v1/coach/outcomes`.
- Going-quiet flag (Cortex step 1, from `quiet` on `/v1/coach/needs-you`): rows in `NeedsYouToday.js` between escalations and drafts (Message = inline `NudgeTool`, "I've got this" = the escalation handled route), and the athlete page's Do this next card (`components/athlete/GoingQuiet.js` inside `DoThisNext.js`). Signal keys get plain labels in `needs-you/useNeedsYou.js`.
- Settings (`app/dashboard/settings/page.js`): `CoachRules.js` (windows, quiet hours, daily limit, never-topics, approval mode) and `V2Roster.js` (per-athlete V2 switch). Proxies in `app/api/settings/rules`, `app/api/roster-v2`.

- Progress photos (coach-only, from the athlete's weekly check-in): roster cards show start vs latest (`photos` on each roster card), the athlete page's Overview shows start vs latest plus every week by pose (`components/athlete/PhotoCompare.js`, engine `GET /v1/checkin/photos/:clientId`). URLs are signed by the engine for 10 minutes; never cache them. The coach-side export/erase lists include `weekly_checkins` and `checkin_photos` and erase removes the files from the private `checkin-photos` bucket.
- Roster (`app/dashboard/athletes/page.js` → `components/roster/RosterBoard.js`): cards (phone first) and a list, from engine `/v1/coach/roster-cards`. Status needs you / drifting / on track / not started with the reason; colour only means status; weight green only when it moves the way the phase wants. Design: Claude Design canvas *PACT Coach Roster — Redesign* (v2).

## Older pieces
Nudges (`app/api/nudge`), relays (`lib/relay.js`) and the coach's Google Calendar (`lib/calendar.js`) go to the engine as the signed-in coach. The console no longer calls the Railway bot (`BOT_URL`, `NUDGE_SECRET`, `WELCOME_SECRET` can be removed from Vercel). `/api/conversation/[clientId]` is the reference pattern for RLS-scoped reads through the coach's session.

## Rules
- Every coach action on a V2 item must go through the engine so it writes `coach_labels`.
- Athlete data list: a coach's delete and export both read `lib/athleteData.js`, which mirrors the engine's `engine/src/domain/athleteData.ts`. When a table is added there, add it to the console list in the same place, then run `node scripts/check-erase-list.mjs` (exits non-zero if they differ; it finds the engine at `~/fitness-coach-bot`, or set `PACT_ENGINE_DIR`).
- Coaches can see and send consent links but must never record consent for an athlete.
- Alex's Mac copy may have uncommitted work (exercise browser, `app/dashboard/layout.js`, `components/ExerciseBrowser.js`). Don't modify those files without asking.

## Check before pushing
```bash
cd ~/pact-coach-console && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x npx next build
```
