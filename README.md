# PACT.Health — Coach Console

The web console where personal trainers log in to see their client roster, drill into individual clients, and read PAX's weekly summaries.

Companion to [`fitness-coach-bot`](https://github.com/AJJ85-T100/fitness-coach-bot) — the bot writes data, the console reads it.

## Stack

- **Next.js 14** App Router, JavaScript
- **Tailwind CSS** for styling against PACT brand tokens
- **Supabase Auth** (magic links) for sign-in
- **Supabase JS** for data, shared database with the bot
- **Vercel** for deploy

## Local setup

```bash
git clone https://github.com/AJJ85-T100/pact-coach-console.git
cd pact-coach-console
npm install
cp .env.example .env.local
# Edit .env.local with your real Supabase values
npm run dev
```

Then open http://localhost:3000.

## Env vars

Three values needed, all from Supabase Dashboard → Project Settings → API:

| Variable                          | Value                              | Where used               |
|-----------------------------------|------------------------------------|--------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Project URL                        | Browser auth + server    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | `anon` public key                  | Browser auth only        |
| `SUPABASE_SERVICE_ROLE_KEY`       | `service_role` secret              | Server-side reads only   |
| `NEXT_PUBLIC_SITE_URL`            | `http://localhost:3000` or prod URL | Magic-link redirect      |

## Supabase setup

1. Run `migration_003_coach_auth_provisioning.sql` against your Supabase project (this installs the trigger that auto-creates a `personal_trainers` row when you sign up).
2. In Supabase Dashboard → Authentication → Providers → Email:
   - Enable Email provider
   - Set "Confirm email" to OFF (for pilot)
3. In Supabase Dashboard → Authentication → URL Configuration:
   - Add `http://localhost:3000/auth/callback` to "Redirect URLs"
   - Add `https://your-vercel-domain.vercel.app/auth/callback` once deployed

## First login

1. Run the app locally (`npm run dev`) or visit your deployed URL
2. Click "Send sign-in link" with your coach email
3. Check your email, click the link
4. You're authenticated — the trigger has created a `personal_trainers` row
5. To see your existing client in the roster, run this one-time backfill in Supabase SQL editor:

```sql
UPDATE clients
   SET pt_id = (
     SELECT pt.id
       FROM personal_trainers pt
       JOIN auth.users u ON u.id = pt.auth_user_id
      WHERE u.email = 'YOUR_LOGIN_EMAIL'
   )
 WHERE name = 'Alex';  -- adjust if your client row has a different name
```

After that, refresh the dashboard — your client appears.

## Deploy to Vercel

1. Push the repo to GitHub
2. Vercel → New Project → Import the repo
3. Vercel auto-detects Next.js; no build config needed
4. Add the four env vars under Project Settings → Environment Variables
5. Set `NEXT_PUBLIC_SITE_URL` to the production URL (e.g. `https://pact-coach-console.vercel.app`)
6. Deploy
7. Add the production callback URL to Supabase Auth → URL Configuration → Redirect URLs

## Routes

| Path                | Purpose                                          | Auth required |
|---------------------|--------------------------------------------------|---------------|
| `/`                 | Redirects based on auth state                    | —             |
| `/login`            | Magic-link sign-in form                          | No            |
| `/auth/callback`    | Handles magic-link redirect                      | No            |
| `/dashboard`        | Roster view — all clients for the signed-in PT   | Yes           |
| `/clients/[id]`     | Drill-in: journey, signals, slips, conversation  | Yes           |

## Not in v1

Deliberately deferred. From the backlog:

- At-risk flagging logic with intelligent thresholds (Epic 5.4)
- Manual nudge tool — coach types a brief, PAX delivers (Epic 5.6)
- Voice calibration capture UI (Epic 3 voice-of-PT work)
- Weekly report rendering on the dashboard (Epic 5.5 — currently delivered by the bot to your email/WhatsApp)
- Programme editor / template browser
- Form review queue

## Security note

The console queries with `SUPABASE_SERVICE_ROLE_KEY` server-side, manually scoping every query by `pt_id`. This is fine for the pilot where there's one coach. Before opening to a second coach, add Supabase RLS policies on `clients`, `conversations`, `daily_pacts`, `health_data`, `slip_events`, etc. that enforce `auth.uid()` → `personal_trainers.id` → `clients.pt_id` scoping at the database layer.
