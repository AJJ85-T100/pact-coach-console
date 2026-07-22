'use client';

// /signup — self-serve, code-gated coach signup (pilot).
// Creates the coach account, then emails a magic link into the console.

import { useEffect, useRef, useState } from 'react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export default function CoachSignupPage() {
  const [form, setForm] = useState({ name: '', business_name: '', email: '', whatsapp_number: '', code: '' });
  const [state, setState] = useState('idle');
  const [doneTitle, setDoneTitle] = useState('Account created 🎉');
  const [err, setErr] = useState('');
  const submitting = useRef(false); // hard double-submit guard (Enter + click race)

  // Prefill from ?name= &email= &business= (e.g. handed off from the app).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setForm((f) => ({
      ...f,
      name: p.get('name') || f.name,
      email: p.get('email') || f.email,
      business_name: p.get('business') || f.business_name,
    }));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function sendLoginLink() {
    try {
      // IMPLICIT flow, deliberately: /auth/bridge consumes #access_token hash
      // tokens (same proven path as the front-door coach sign-in). The default
      // PKCE flow returns ?code= instead, which the bridge can't use — and
      // PKCE links break when the email opens in a different browser anyway.
      const sb = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { flowType: 'implicit', persistSession: false } }
      );
      await sb.auth.signInWithOtp({
        email: form.email.trim().toLowerCase(),
        options: { emailRedirectTo: location.origin + '/auth/bridge', shouldCreateUser: false },
      });
    } catch (e) { /* non-fatal — they can still sign in from /login */ }
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting.current) return;   // ignore a second submit racing the first
    setErr('');
    if (!form.name.trim() || !form.email.trim() || !form.code.trim()) {
      setErr('Name, email and your signup code are required.');
      return;
    }
    submitting.current = true;
    setState('sending');
    let d = {}, res;
    try {
      res = await fetch('/api/coach/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      d = await res.json();
    } catch (e) {
      setErr('Network error — please try again.'); setState('idle'); submitting.current = false; return;
    }

    if (!res.ok) {
      if (res.status === 409) {
        // Account already exists for this login — don't dead-end them, just
        // email a sign-in link (it only lands in the owner's inbox, so safe).
        await sendLoginLink();
        setDoneTitle('You already have an account');
        setState('done');
        submitting.current = false;
        return;
      }
      setErr(d.error || 'Something went wrong.'); setState('idle'); submitting.current = false; return;
    }

    // Fresh account — email them a magic link into the console.
    await sendLoginLink();
    setDoneTitle('Account created 🎉');
    setState('done');
    submitting.current = false;
  }

  const field = 'w-full px-4 py-3 bg-bg border border-border rounded text-blue mb-4';

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue text-white rounded grid place-items-center font-display font-black text-lg">P</div>
          <div className="font-display font-extrabold text-blue text-lg tracking-tight">PACT.Coach</div>
        </div>

        {state === 'done' ? (
          <div className="bg-white rounded-lg shadow-card p-8">
            <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-2">You're in</p>
            <h1 className="font-display font-extrabold text-blue text-2xl mb-3">{doneTitle}</h1>
            <p className="text-body text-sm leading-relaxed">
              We've sent a sign-in link to <b className="text-blue">{form.email}</b>. Tap it to open your console —
              from there you'll calibrate PAX's voice and invite your first client.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-lg shadow-card p-8">
            <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Coach signup</p>
            <h1 className="font-display font-extrabold text-blue text-2xl mb-1">Set up your practice</h1>
            <p className="text-body text-sm mb-6">
              Two minutes to your console. The pilot is invite-only, so you'll need the signup code from PACT —
              no code yet? Email <a href="mailto:hello@pact.healthcare" className="text-red font-semibold">hello@pact.healthcare</a> and
              we'll get you in.
            </p>

            {err && <div className="text-red text-sm mb-4">{err}</div>}

            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Your name</label>
            <input className={field} value={form.name} onChange={set('name')} placeholder="Sam Mitchell" autoComplete="name" />

            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Business (optional)</label>
            <input className={field} value={form.business_name} onChange={set('business_name')} placeholder="Mitchell Strength" />

            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Email</label>
            <input className={field} type="email" value={form.email} onChange={set('email')} placeholder="sam@example.com" autoComplete="email" />

            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Your WhatsApp (optional)</label>
            <input className={field} type="tel" value={form.whatsapp_number} onChange={set('whatsapp_number')} placeholder="+44 7700 900123" />

            <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Signup code</label>
            <input className={field} value={form.code} onChange={set('code')} placeholder="Enter the code from PACT" autoCapitalize="characters" autoComplete="off" />

            <button type="submit" disabled={state === 'sending'}
              className="w-full bg-red text-white font-semibold uppercase tracking-wider text-xs py-3.5 rounded hover:bg-red-deep disabled:opacity-60">
              {state === 'sending' ? 'Creating your account…' : 'Create my coach account →'}
            </button>

            <p className="text-center text-muted text-xs mt-4">
              Already have an account? <a href="/login" className="text-blue font-semibold">Sign in</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
