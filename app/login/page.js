'use client';

// ============================================================
// The Coach Console no longer has its own sign-in screen.
//
// PACT's single front door (the athlete/coach login app) handles
// ALL auth. A coach requests a magic link there; the link lands
// on this app's /auth/callback already signed in — so nobody
// should ever need this page. Anyone who reaches /login
// unauthenticated (middleware redirect, old bookmark) is sent
// straight to the front door with the coach tab pre-selected.
//
// Front door URL: set NEXT_PUBLIC_FRONT_DOOR_URL in Vercel if it
// differs from the default below.
// ============================================================

import { useEffect } from 'react';

const FRONT_DOOR =
  process.env.NEXT_PUBLIC_FRONT_DOOR_URL || 'https://pact-athlete.vercel.app';

export default function LoginPage() {
  useEffect(() => {
    window.location.replace(`${FRONT_DOOR}/?role=coach`);
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
        <p className="text-body text-sm">
          Taking you to the PACT sign-in…{' '}
          <a className="text-red font-semibold" href={`${FRONT_DOOR}/?role=coach`}>
            Continue
          </a>
        </p>
      </div>
    </main>
  );
}
