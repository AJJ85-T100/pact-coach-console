// ============================================================
// Supabase — Middleware Client
// ============================================================
// Runs on every request to keep the user's session token
// fresh. Without this, server components see a stale session
// and the user gets bounced back to /login after their token
// quietly expires.
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: this call refreshes the session token if needed.
  // Do not remove.
  await supabase.auth.getUser();

  return response;
}
