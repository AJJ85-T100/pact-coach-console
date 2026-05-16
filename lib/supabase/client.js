// ============================================================
// Supabase — Browser Client
// ============================================================
// Used in Client Components for auth interactions (sign-in,
// sign-out). Reads the anon key only — safe to expose to the
// browser because Supabase Auth + RLS enforce access scope.
// ============================================================

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
