// ============================================================
// Next.js Middleware — Auth gating
// ============================================================
// Refreshes the Supabase session on every request and bounces
// unauthenticated visitors away from protected routes.
// ============================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_PREFIXES = ['/dashboard', '/clients'];
const PUBLIC_PREFIXES    = ['/login', '/auth'];

export async function middleware(request) {
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

  // Refresh the session
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(p => path.startsWith(p));
  const isPublic    = PUBLIC_PREFIXES.some(p => path.startsWith(p));

  // Unauthenticated user hitting a protected route → /login
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting /login → /dashboard
  if (path === '/login' && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashUrl);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
