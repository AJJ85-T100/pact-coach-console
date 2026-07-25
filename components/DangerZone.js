'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * DangerZone — archive or permanently erase a client.
 *
 * Archive is the everyday action: status → 'churned', reversible, history kept.
 * Erase is GDPR erasure: everything goes, guarded by typing the client's name.
 *
 * Usage: <DangerZone clientId={client.id} clientName={client.name} />
 */
export default function DangerZone({ clientId, clientName }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function archive() {
    if (!window.confirm(`Archive ${clientName}? They'll stop receiving PAX messages and drop off your active roster. History is kept and this can be undone.`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}?mode=archive`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Archive failed.');
      router.push('/dashboard/athletes');
      router.refresh();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function erase() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}?mode=erase`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_name: confirmName }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Delete failed.');
      // The route now returns a per-step receipt. A partial erase used to
      // report plain success, and once the clients row was gone there was
      // no way to find what had been left behind.
      if (j.complete === false) {
        throw new Error(
          `Partly erased. These steps failed and need a manual check: ${(j.failed_steps || []).join(', ')}`
        );
      }
      router.push('/dashboard/athletes');
      router.refresh();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="border border-red/25 rounded-lg p-5 mt-6">
      <h3 className="font-display font-extrabold text-red text-xs uppercase tracking-wide mb-3">Danger zone</h3>

      {/* Subject-access / portability (UK GDPR Art 15 + 20). Until this
          existed, the privacy policy offered these rights with nothing
          behind them. */}
      <div className="flex items-center justify-between gap-4 py-2 border-b border-border mb-2 pb-3">
        <div>
          <div className="text-sm font-semibold text-blue">Export their data</div>
          <div className="text-xs text-muted mt-0.5">Everything PACT holds about {clientName}, as JSON. Send it to them if they ask what you have on file.</div>
        </div>
        <a href={`/api/clients/${clientId}/export`} download
          className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wider text-blue border border-border rounded px-3.5 py-2 hover:border-blue transition-colors">
          Export
        </a>
      </div>

      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <div className="text-sm font-semibold text-blue">Archive this athlete</div>
          <div className="text-xs text-muted mt-0.5">Stops PAX messages and removes them from your active roster. History kept — reversible.</div>
        </div>
        <button onClick={archive} disabled={busy}
          className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wider text-blue border border-border rounded px-3.5 py-2 hover:border-blue transition-colors disabled:opacity-50">
          Archive
        </button>
      </div>

      <div className="border-t border-border mt-2 pt-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue">Delete permanently</div>
            <div className="text-xs text-muted mt-0.5">Erases the athlete and everything we hold — conversations, pacts, health and wearable history, workout logs, form-check videos, their sign-in. Cannot be undone. Export first if they might want a copy.</div>
          </div>
          {!erasing && (
            <button onClick={() => setErasing(true)} disabled={busy}
              className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wider text-red border border-red/40 rounded px-3.5 py-2 hover:bg-red hover:text-white transition-colors disabled:opacity-50">
              Delete…
            </button>
          )}
        </div>

        {erasing && (
          <div className="mt-3 bg-red/5 border border-red/20 rounded p-3.5">
            <p className="text-xs text-body mb-2">
              Type <strong className="text-blue">{clientName}</strong> to confirm permanent deletion.
            </p>
            <input autoFocus value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
              placeholder={clientName}
              className="w-full bg-white border border-border rounded px-3 py-2.5 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-red mb-2.5" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setErasing(false); setConfirmName(''); setError(null); }} disabled={busy}
                className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-blue px-3 py-2">
                Cancel
              </button>
              <button onClick={erase} disabled={busy || confirmName.trim() !== clientName.trim()}
                className="bg-red text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-2 rounded hover:bg-red-deep transition-colors disabled:opacity-40">
                {busy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red text-xs mt-3">{error}</p>}
    </div>
  );
}
