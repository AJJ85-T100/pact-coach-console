'use client';

/**
 * Business — the coach's usual monthly churn before PACT, so Today can
 * estimate what PACT keeps. Saved to personal_trainers.baseline_monthly_churn_pct
 * via /api/settings/business (scoped to the signed-in coach).
 */
import { useEffect, useState } from 'react';

export default function BusinessSettings() {
  const [state, setState] = useState({ status: 'loading' });
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    fetch('/api/settings/business', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return setState({ status: 'error' });
        setState({ status: j.available ? 'ok' : 'pending' });
        setValue(j.baselineMonthlyChurnPct == null ? '' : String(j.baselineMonthlyChurnPct));
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/settings/business', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baselineMonthlyChurnPct: value === '' ? null : Number(value) }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? 'Saved.' : j.error || 'Couldn’t save.');
    } catch {
      setMsg('Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  const box = 'bg-white border border-border p-5 text-sm';
  if (state.status === 'loading') return <div className={`${box} text-muted`}>Loading…</div>;
  if (state.status === 'error') return <div className={`${box} text-muted`}>Couldn’t load this just now.</div>;

  return (
    <form onSubmit={save} className={`${box} flex flex-col gap-3`}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-muted">Usual monthly churn before PACT (%)</span>
        <span className="flex flex-wrap gap-2 items-center">
          <input
            type="number" inputMode="decimal" min="0" max="100" step="0.1"
            value={value} onChange={(e) => setValue(e.target.value)}
            disabled={state.status === 'pending'}
            placeholder="e.g. 6"
            className="w-32 min-h-[44px] px-3 border border-border text-blue font-semibold focus:outline-none focus:border-blue"
            style={{ borderRadius: 0 }}
          />
          <button type="submit" disabled={busy || state.status === 'pending'} className="min-h-[44px] px-4 text-[13px] font-semibold bg-blue text-white hover:bg-blue-light disabled:opacity-50" style={{ borderRadius: 0 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </span>
      </label>
      <p className="text-muted">
        Of the athletes you have at the start of a month, the share who usually leave by the end of it. Today uses it with each athlete’s monthly fee to estimate what PACT keeps. Set fees and renewal dates on each athlete’s Settings tab.
      </p>
      {state.status === 'pending' && <p className="text-[13px] text-muted">This needs a database update first. It’ll work once that’s run.</p>}
      {msg && <p className="text-[13px] text-blue" role="status">{msg}</p>}
    </form>
  );
}
