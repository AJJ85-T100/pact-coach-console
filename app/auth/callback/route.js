// ============================================================
// Auth callback — magic-link landing
// ============================================================
// Supabase magic links redirect back here with a code in the
// query string. We exchange that code for a session, then
// send the user to the dashboard.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] exchange error:', error);
  }

  // Code missing or exchange failed — bounce back to login with an error flag
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
