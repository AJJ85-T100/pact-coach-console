// ============================================================
// Next.js Middleware — Auth gating
// ============================================================
// Refreshes the Supabase session on every request and bounces
// unauthenticated visitors away from protected routes.
// ============================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ⚠️ SECURITY (review C2) — this middleware is DEFAULT-DENY.
//
// It used to allow-list what to PROTECT (`/dashboard`, `/clients`), which
// meant any route added outside those two prefixes was public by accident.
// That is exactly what happened: a stale copy of the at-risk route sat at
// `/at-risk/[clientId]`, outside `/api`, and served athlete health data plus
// verbatim WhatsApp transcripts to anyone on the internet.
//
// Now the list below is the ONLY thing that is public. Everything else needs
// a Supabase session. Adding a route requires no middleware change; making
// one public is a deliberate edit here.
//
// This is a gate, not the gate — every API route still does its own
// requireCoach/requireClientAccess check, and server components re-check
// (see app/dashboard/layout.js). Middleware alone must never be load-bearing:
// CVE-2025-29927 lets a crafted header skip it entirely on Next < 14.2.25.
// Exact matches only — a prefix here would also open sibling paths
// (`/api/coach/signup` as a prefix matches `/api/coach/signupXX/evil`).
const PUBLIC_EXACT = new Set([
  '/',                    // server component: redirects to /dashboard or /login
  '/login',
  '/signup',              // coach self-serve signup (code-gated in its API route)
  '/onboard',             // athlete wizard (invite-token gated)
  '/admin',               // has its own password + signed-cookie auth
  '/api/coach/signup',    // code-gated coach signup
  '/api/terra/connect',   // athlete device connect during onboarding
  '/api/gym-scan',        // onboarding gym photo scan (token gated)
]);

// Genuine subtrees. Keep the trailing slash — without it these become
// sloppy prefixes too.
const PUBLIC_PREFIXES = [
  '/auth/',               // magic-link bridge + OAuth callback
  '/onboard/',            // wizard sub-pages: connect, connected, gym-scan…
  '/api/onboard/',        // wizard APIs — invite-token gated
  '/api/admin/',          // admin portal APIs — own auth, incl. login
];

function isPublicPath(path) {
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some(p => path.startsWith(p));
}

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

  // Default-deny: anything not explicitly public needs a session.
  if (!isPublicPath(path) && !user) {
    // API callers get a status code they can act on, not an HTML redirect.
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';   // never reflect the attempted URL back
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
