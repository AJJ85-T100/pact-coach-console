'use client';

import { useState } from 'react';

export default function InvitePage() {
  const [form, setForm] = useState({
    client_name: '',
    client_phone: '',
    expires_in_days: 7,
  });
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch('/api/invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setInvite(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setInvite(null);
    setError(null);
    setCopied(false);
    setForm({ client_name: '', client_phone: '', expires_in_days: 7 });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invite.invite_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  }

  function whatsappShareUrl() {
    const greeting = invite.client_name ? `Hi ${invite.client_name},` : 'Hi,';
    const msg = `${greeting}

You're invited to join my coaching on PACT.Health — the platform I use to keep us connected between our sessions.

Tap here to set up your profile (takes 5 minutes):
${invite.invite_url}

PAX (the AI accountability companion) will introduce themselves once you're done.`;

    const phone = (invite.client_phone || '').replace(/[^\d]/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  function expiresLabel() {
    if (!invite?.expires_at) return '';
    const d = new Date(invite.expires_at);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="px-8 lg:px-10 py-8 lg:py-10 max-w-3xl">

      {/* Page header */}
      <header className="mb-8">
        <p className="text-[11px] font-semibold text-red tracking-[0.2em] uppercase mb-3 pt-2 border-t-2 border-red inline-block">
          New invite
        </p>
        <h1 className="font-display font-extrabold text-blue text-4xl uppercase tracking-tight leading-none mb-2">
          Invite a client
        </h1>
        <p className="text-body text-sm">
          Generates a one-time onboarding link. Send it to your athlete via WhatsApp or email — they fill out a 5-minute wizard and PAX takes it from there.
        </p>
      </header>

      {!invite ? (
        // ============================================================
        // FORM
        // ============================================================
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-card border border-border p-6 space-y-5">

          <Field label="Client name" optional hint="Pre-fills their greeting in the WhatsApp message">
            <input
              type="text"
              value={form.client_name}
              onChange={e => setForm({ ...form, client_name: e.target.value })}
              placeholder="e.g. Sarah Mitchell"
              maxLength={80}
              className="w-full bg-bg border border-border rounded px-3.5 py-2.5 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
            />
          </Field>

          <Field label="WhatsApp number" optional hint="Include country code (e.g. +44 7700 900123). Enables direct WhatsApp share.">
            <input
              type="tel"
              value={form.client_phone}
              onChange={e => setForm({ ...form, client_phone: e.target.value })}
              placeholder="+44 7700 900123"
              maxLength={20}
              className="w-full bg-bg border border-border rounded px-3.5 py-2.5 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
            />
          </Field>

          <Field label="Link expires in">
            <select
              value={form.expires_in_days}
              onChange={e => setForm({ ...form, expires_in_days: parseInt(e.target.value, 10) })}
              className="w-full bg-bg border border-border rounded px-3.5 py-2.5 text-sm text-blue focus:outline-none focus:border-blue transition-colors"
            >
              <option value={1}>24 hours</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days (recommended)</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </Field>

          {error && (
            <div className="bg-red/10 border border-red/30 text-red px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red text-white font-semibold tracking-wider uppercase text-xs py-3.5 rounded hover:bg-red-deep transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate invite link →'}
          </button>
        </form>
      ) : (
        // ============================================================
        // SUCCESS STATE — show the invite link
        // ============================================================
        <div className="space-y-5">

          <div className="bg-blue text-white rounded-lg p-6">
            <p className="text-[11px] font-semibold text-red tracking-[0.25em] uppercase mb-3">
              Invite ready
            </p>
            <h2 className="font-display font-extrabold text-2xl uppercase tracking-tight leading-none mb-2">
              {invite.client_name ? `For ${invite.client_name}` : 'Ready to send'}
            </h2>
            <p className="text-white/70 text-sm">
              Expires {expiresLabel()}. One-time use — once your athlete completes onboarding, the link locks.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-card border border-border p-5">
            <div className="text-[10px] font-bold text-muted tracking-[0.18em] uppercase mb-2">
              Onboarding link
            </div>
            <div className="font-mono text-xs text-blue bg-bg rounded px-3 py-2.5 break-all border border-border">
              {invite.invite_url}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              <button
                onClick={copyLink}
                className="flex items-center justify-center gap-2 bg-blue text-white font-semibold tracking-wider uppercase text-xs py-3 rounded hover:bg-blue-light transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy link'}
              </button>

              {invite.client_phone ? (
                <a
                  href={whatsappShareUrl()}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center justify-center gap-2 bg-red text-white font-semibold tracking-wider uppercase text-xs py-3 rounded hover:bg-red-deep transition-colors"
                >
                  Send via WhatsApp →
                </a>
              ) : (
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`You're invited to join my coaching on PACT.Health. Set up your profile here: ${invite.invite_url}`)}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center justify-center gap-2 bg-red text-white font-semibold tracking-wider uppercase text-xs py-3 rounded hover:bg-red-deep transition-colors"
                >
                  Share via WhatsApp →
                </a>
              )}
            </div>
          </div>

          <button
            onClick={reset}
            className="text-xs font-semibold tracking-wider uppercase text-muted hover:text-red transition-colors"
          >
            ← Generate another invite
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, optional, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[10px] font-bold text-blue tracking-[0.18em] uppercase">
          {label} {optional && <span className="text-muted font-medium normal-case tracking-normal">· optional</span>}
        </label>
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  );
}
