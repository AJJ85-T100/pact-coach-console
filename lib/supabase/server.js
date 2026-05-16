// ============================================================
// Supabase — Server Client
// ============================================================
// Two clients here:
//
// 1. createClient()      — auth-aware, scoped to the signed-in
//    user via cookies. Used to fetch the current user and
//    to perform writes the user is authorised for.
//
// 2. createServiceClient() — bypasses RLS using the service
//    role key. Used ONLY for data reads in Server Components
//    where we manually scope by pt_id. Never exposed to the
//    client.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — can be ignored if
            // middleware is refreshing sessions on the way through.
          }
        },
      },
    }
  );
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
