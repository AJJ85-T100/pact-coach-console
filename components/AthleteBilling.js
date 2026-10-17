'use client';

/**
 * Athlete page → Settings: what this athlete pays and when they renew.
 * Saved to clients.monthly_fee / clients.renewal_date via
 * /api/clients/[clientId]/billing (requireClientAccess: coach must own them).
 * Feeds "Revenue at risk" on Today.
 */
import { useEffect, useState } from 'react';

export default function AthleteBilling({ clientId, firstName }) {
  const [state, setState] = useState({ status: 'loading' });
  const [fee, setFee] = useState('');
  const [renewal, setRenewal] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/billing`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return setState({ status: 'error' });
        setState({ status: j.available ? 'ok' : 'pending' });
        setFee(j.monthlyFee == null ? '' : String(j.monthlyFee));
        setRenewal(j.renewalDate || '');
      })
      .catch(() => setState({ status: 'error' }));
  }, [clientId]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/billing`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monthlyFee: fee === '' ? null : Number(fee), renewalDate: renewal || null }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? 'Saved.' : j.error || 'Couldn’t save.');
    } catch {
      setMsg('Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  const pending = state.status === 'pending';
  const input = 'min-h-[44px] px-3 border border-border text-blue font-semibold focus:outline-none focus:border-blue disabled:bg-bg';

  return (
    <section className="bg-white border border-border p-5" aria-labelledby="ath-billing">
      <h3 id="ath-billing" className="font-display font-extrabold text-blue text-[15px] uppercase tracking-tight">Fees and renewal</h3>
      <p className="text-sm text-muted mt-1.5">Used on Today to show what’s at risk when {firstName || 'they'} start{firstName ? 's' : ''} to drift. Only you see this.</p>
      {state.status === 'loading' && <p className="text-sm text-muted mt-3">Loading…</p>}
      {state.status === 'error' && <p className="text-sm text-muted mt-3">Couldn’t load this just now.</p>}
      {(state.status === 'ok' || pending) && (
        <form onSubmit={save} className="mt-4 flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted">Monthly fee (£)</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} disabled={pending} placeholder="e.g. 180" className={`${input} w-36`} style={{ borderRadius: 0 }} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted">Renewal date</span>
            <input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} disabled={pending} className={input} style={{ borderRadius: 0 }} />
          </label>
          <button type="submit" disabled={busy || pending} className="min-h-[44px] px-4 text-[13px] font-semibold bg-blue text-white hover:bg-blue-light disabled:opacity-50" style={{ borderRadius: 0 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {pending && <p className="text-[13px] text-muted mt-3">This needs a database update first. It’ll work once that’s run.</p>}
      {msg && <p className="text-[13px] text-blue mt-3" role="status">{msg}</p>}
    </section>
  );
}
