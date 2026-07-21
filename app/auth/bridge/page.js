'use client';

// ============================================================
// /auth/bridge — completes a sign-in that STARTED on the PACT
// front door (pact-athlete.vercel.app).
//
// The front door requests the coach's magic link with
// redirect_to = this page. Supabase's verify step lands here
// with the session tokens in the URL fragment (#access_token…).
// We plant them as this app's own cookie session, then head to
// the dashboard. /auth/* is public in middleware, so no guard
// bounces us while we do it.
// ============================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const FRONT_DOOR =
  process.env.NEXT_PUBLIC_FRONT_DOOR_URL || 'https://pact-athlete.vercel.app';

export default function BridgePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (!access_token || !refresh_token) {
        setFailed(true);
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.error('[bridge] setSession failed', error);
        setFailed(true);
        return;
      }

      // Clean the tokens out of the URL, then in we go.
      window.location.replace('/dashboard');
    })();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-bg">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 bg-blue text-white grid place-items-center font-display font-black text-lg rounded">
            P
          </div>
          <div className="font-display font-extrabold text-blue tracking-wide">
            PACT<span className="text-red">.</span>HEALTH
          </div>
        </div>
        {failed ? (
          <p className="text-body text-sm">
            That sign-in link didn&apos;t carry a valid session — it may have expired.{' '}
            <a className="text-red font-semibold" href={`${FRONT_DOOR}/?role=coach`}>
              Request a fresh one
            </a>
          </p>
        ) : (
          <p className="text-body text-sm">Signing you in to the Coach Console…</p>
        )}
      </div>
    </main>
  );
}
