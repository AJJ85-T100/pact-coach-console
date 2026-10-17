'use client';

/**
 * Escalation alerts — the coach's own Telegram gets a ping the moment an
 * athlete is escalated (crisis, medical, pain…). Via the engine as the coach:
 * GET /api/alerts, POST/DELETE /api/alerts/link. If the engine hasn't got
 * this yet (404) or it isn't configured (503), say so quietly.
 */
import { useEffect, useState } from 'react';

export default function EscalationAlerts() {
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/alerts', { cache: 'no-store' });
      if (res.status === 404 || res.status === 503) return setState({ status: 'off' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ status: 'error' });
      setState({ status: 'ok', linked: !!j.telegramLinked });
    } catch {
      setState({ status: 'error' });
    }
  }
  useEffect(() => { load(); }, []);

  async function link() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/alerts/link', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.status === 404 || res.status === 503) { setState({ status: 'off' }); return; }
      if (!res.ok || !j.url) { setMsg(j.error || 'Couldn’t get a link. Try again in a minute.'); return; }
      window.open(j.url, '_blank', 'noopener,noreferrer');
      setMsg('Telegram is open in a new tab. Tap Start there, then come back and refresh.');
    } catch {
      setMsg('Couldn’t reach PAX. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!window.confirm('Stop escalation alerts on Telegram? They’ll still show on Today.')) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/alerts/link', { method: 'DELETE' });
      if (!res.ok) setMsg('Couldn’t switch them off. Try again in a minute.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const box = 'bg-white border border-border p-5 text-sm';
  if (state.status === 'loading') return <div className={`${box} text-muted`}>Loading…</div>;
  if (state.status === 'off') return <div className={`${box} text-muted`}>Alerts aren’t switched on yet.</div>;
  if (state.status === 'error') return <div className={`${box} text-muted`}>Couldn’t check your alerts just now.</div>;

  return (
    <div className={`${box} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-blue">{state.linked ? 'On · Telegram' : 'Off'}</p>
          <p className="text-muted mt-1">
            {state.linked
              ? 'You’ll get a Telegram message as soon as an athlete is escalated.'
              : 'Link your own Telegram and PAX will message you the moment an athlete needs a human.'}
          </p>
        </div>
        {state.linked ? (
          <button onClick={unlink} disabled={busy} className="min-h-[44px] px-4 text-[13px] font-semibold border border-border text-muted hover:border-blue hover:text-blue disabled:opacity-50" style={{ borderRadius: 0 }}>
            {busy ? 'Saving…' : 'Turn off'}
          </button>
        ) : (
          <button onClick={link} disabled={busy} className="min-h-[44px] px-4 text-[13px] font-semibold bg-blue text-white hover:bg-blue-light disabled:opacity-50" style={{ borderRadius: 0 }}>
            {busy ? 'Opening…' : 'Connect Telegram'}
          </button>
        )}
      </div>
      {msg && <p className="text-[13px] text-blue" role="status">{msg}</p>}
    </div>
  );
}
