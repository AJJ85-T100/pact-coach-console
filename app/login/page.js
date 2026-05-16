'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail]     = useState('');
  const [state, setState]     = useState('idle');  // 'idle' | 'sending' | 'sent' | 'error'
  const [error, setError]     = useState('');

  async function sendMagicLink(e) {
    e.preventDefault();
    setState('sending');
    setError('');

    const supabase = createClient();
    const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (err) {
      setError(err.message);
      setState('error');
    } else {
      setState('sent');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-bg">
      <div className="w-full max-w-md">

        {/* Brand mark */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-9 h-9 bg-blue text-white grid place-items-center font-display font-black text-lg rounded">
            P
          </div>
          <div className="font-display font-extrabold text-blue tracking-wide">
            PACT<span className="text-red">.</span>HEALTH
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-card p-8">
          <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-2">
            Coach Console
          </p>
          <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight leading-tight mb-2">
            Sign in
          </h1>
          <p className="text-body text-sm leading-relaxed mb-8">
            Enter your email and we&apos;ll send you a one-tap sign-in link. No passwords.
          </p>

          {state !== 'sent' ? (
            <form onSubmit={sendMagicLink} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">
                  Coach email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourcoaching.co.uk"
                  className="w-full px-4 py-3 bg-bg border border-border rounded text-blue focus:outline-none focus:border-red focus:bg-white transition-colors"
                />
              </div>

              {error && (
                <p className="text-red text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={state === 'sending'}
                className="w-full bg-red text-white font-semibold uppercase tracking-wider text-xs py-3.5 rounded hover:bg-red-deep disabled:opacity-60 transition-colors"
              >
                {state === 'sending' ? 'Sending link…' : 'Send sign-in link →'}
              </button>
            </form>
          ) : (
            <div className="rounded border-l-4 border-red bg-bg-alt p-5">
              <p className="font-display font-bold text-blue text-sm uppercase tracking-wide mb-1">
                Check your inbox
              </p>
              <p className="text-body text-sm leading-relaxed">
                We&apos;ve sent a sign-in link to <span className="text-blue font-medium">{email}</span>. Click it to open the Coach Console.
              </p>
            </div>
          )}
        </div>

        <p className="text-center mt-6 text-muted text-xs tracking-wide">
          The pact between you and the plan.
        </p>
      </div>
    </main>
  );
}
