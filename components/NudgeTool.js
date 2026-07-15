'use client';

import { useState } from 'react';

/**
 * NudgeTool — the coach types a brief; PAX sends the actual message in the
 * coach's calibrated voice, right now, and shows what went out.
 *
 * Usage: <NudgeTool clientId={client.id} clientFirstName={firstName} />
 */
export default function NudgeTool({ clientId, clientFirstName }) {
  const [brief, setBrief] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);

  async function send() {
    setSending(true); setError(null); setSent(null);
    try {
      const res = await fetch(`/api/nudge/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Nudge failed.');
      setSent(j.sent);
      setBrief('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white border border-border rounded-lg p-5">
      <h3 className="font-display font-extrabold text-blue text-xs uppercase tracking-wide mb-1">
        Nudge via PAX
      </h3>
      <p className="text-muted text-xs mb-4 leading-relaxed">
        Tell PAX what you want said — it writes and sends the message in your voice, right now.
        {clientFirstName ? ` ${clientFirstName} just sees PAX being PAX.` : ''}
      </p>

      <textarea
        value={brief}
        onChange={(e) => { setBrief(e.target.value); setSent(null); }}
        rows={2}
        maxLength={500}
        placeholder={`e.g. "check in on the knee before tomorrow's session" or "give them a push about the weekend plan"`}
        className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-none"
      />

      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-muted">PAX won&apos;t quote you or say you asked — it just shows up.</p>
        <button onClick={send} disabled={sending || !brief.trim()}
          className="bg-red text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5 rounded hover:bg-red-deep transition-colors disabled:opacity-40">
          {sending ? 'Sending…' : 'Send via PAX'}
        </button>
      </div>

      {sent && (
        <div className="mt-4">
          <div className="text-[10px] font-bold text-muted uppercase tracking-[0.16em] mb-1.5">Sent just now</div>
          <div className="bg-[#EBF1F5] rounded-lg rounded-bl-[2px] px-3.5 py-2.5 text-sm text-blue leading-relaxed whitespace-pre-wrap">
            {sent}
          </div>
        </div>
      )}
      {error && <p className="text-red text-xs mt-3">{error}</p>}
    </div>
  );
}
