/**
 * Shared admin Supabase client for server-side route handlers.
 *
 * The custom global.fetch override is the important bit — it forces every
 * Supabase request to bypass Next.js's fetch cache. Without it, Next.js
 * silently caches Supabase responses (since supabase-js uses fetch under
 * the hood), causing GET routes to return stale data even after PATCH/POST
 * writes have committed. Hit this on Wave 2a and lost a few hours; the
 * override prevents it everywhere.
 *
 * Uses the service role key, which bypasses RLS. Only import this from
 * trusted server code (route handlers, server actions). Never expose to
 * the client.
 */

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  },
);
