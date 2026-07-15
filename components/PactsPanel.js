'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * PactsPanel — coach-side pact authoring + live status for one client.
 *
 * The standing weekly wins: the coach defines them here, PAX enforces them
 * daily (they become the morning "TODAY'S PACT" wins) and scores them into
 * the stack. Visual language matches the Active Pacts mockup: letter mark,
 * live read line, ON / WATCH / PAUSED state.
 *
 * Usage: <PactsPanel clientId={client.id} />
 */

const TEMPLATES = [
  { name: 'Train 4× per week', metric: 'sessions_per_week', target_value: 4, cadence: 'weekly', letter: 'B' },
  { name: 'Hit 180g protein daily', metric: 'protein', target_value: 180, cadence: 'daily', letter: 'P' },
  { name: '10,000 steps daily', metric: 'steps', target_value: 10000, cadence: 'daily', letter: 'S' },
  { name: '7+ hours sleep', metric: 'sleep_hours', target_value: 7, cadence: 'daily', letter: 'Z' },
  { name: 'Daily weigh-in', metric: 'weigh_in', target_value: null, cadence: 'daily', letter: 'W' },
  { name: 'Log every meal', metric: 'log_meals', target_value: null, cadence: 'daily', letter: 'M' },
];

const letterFor = (p) =>
  TEMPLATES.find((t) => t.metric === p.metric)?.letter || (p.name || '?')[0].toUpperCase();

export default function PactsPanel({ clientId }) {
  const [pacts, setPacts] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pacts/${clientId}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load pacts.');
      setPacts(j.pacts || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function create(body) {
    setBusy(true);
    try {
      const res = await fetch(`/api/pacts/${clientId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not create the pact.');
      setAdding(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(pactId, status) {
    setBusy(true);
    try {
      await fetch(`/api/pacts/${clientId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pact_id: pactId, status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const active = (pacts || []).filter((p) => p.status === 'active');
  const paused = (pacts || []).filter((p) => p.status === 'paused');
  const onCount = active.filter((p) => p.live?.signal === 'on').length;

  return (
    <div className="bg-white border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-extrabold text-blue text-sm uppercase tracking-wide">Active pacts</h3>
        {active.length > 0 && (
          <span className="text-xs text-muted font-medium">{onCount} of {active.length} honoured</span>
        )}
      </div>

      {error && <p className="text-red text-xs mb-3">{error}</p>}
      {pacts === null && !error && <p className="text-muted text-xs">Loading pacts…</p>}

      {pacts !== null && active.length === 0 && !adding && (
        <p className="text-muted text-sm italic mb-4">
          No pacts yet. These are the weekly wins PAX holds this client to — start with the classics below.
        </p>
      )}

      <div className="space-y-2">
        {active.map((p) => <PactRow key={p.id} pact={p} onPause={() => setStatus(p.id, 'paused')} busy={busy} />)}
      </div>

      {paused.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-[10px] font-bold text-muted uppercase tracking-[0.16em] mb-2">Paused</div>
          <div className="space-y-2">
            {paused.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-bg rounded px-3 py-2 opacity-70">
                <span className="text-sm text-body">{p.name}</span>
                <div className="flex gap-3">
                  <button onClick={() => setStatus(p.id, 'active')} disabled={busy}
                    className="text-[10px] font-semibold uppercase tracking-wider text-blue hover:text-red transition-colors">Resume</button>
                  <button onClick={() => setStatus(p.id, 'retired')} disabled={busy}
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-red transition-colors">Retire</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        {adding ? (
          <AddPact
            existing={active}
            busy={busy}
            onCreate={create}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button onClick={() => setAdding(true)}
            className="w-full py-2.5 rounded border-2 border-dashed border-border text-xs font-semibold uppercase tracking-wider text-muted hover:border-blue hover:text-blue transition-colors">
            + Add a pact
          </button>
        )}
      </div>
    </div>
  );
}

function PactRow({ pact, onPause, busy }) {
  const signal = pact.live?.signal || 'on';
  const watch = signal === 'watch';
  return (
    <div className={`flex items-center gap-3 rounded-r-lg bg-bg-2 px-3 py-2.5 border-l-4 ${watch ? 'border-warn' : 'border-blue'}`}>
      <div className="w-8 h-8 bg-white rounded grid place-items-center font-display font-black text-sm text-blue flex-shrink-0">
        {letterFor(pact)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-blue text-sm leading-tight">{pact.name}</div>
        <div className="text-muted text-[11px] mt-0.5 truncate">
          {pact.live?.read || pact.rule || (pact.cadence === 'weekly' ? 'Weekly' : 'Daily')}
          {pact.current_streak > 1 ? ` · ${pact.current_streak}-day streak` : ''}
        </div>
      </div>
      <span className={`text-[11px] font-bold uppercase tracking-wider flex-shrink-0 ${watch ? 'text-warn' : 'text-emerald-600'}`}>
        {watch ? 'Watch' : 'On'}
      </span>
      <button onClick={onPause} disabled={busy} title="Pause this pact"
        className="text-muted hover:text-blue transition-colors text-sm flex-shrink-0 px-1">⏸</button>
    </div>
  );
}

function AddPact({ existing, busy, onCreate, onCancel }) {
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ name: '', metric: 'custom', target_value: '', cadence: 'daily' });

  const taken = new Set(existing.map((p) => p.metric));
  const available = TEMPLATES.filter((t) => t.metric === 'custom' || !taken.has(t.metric));

  if (custom) {
    return (
      <div className="space-y-3">
        <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. No alcohol on weekdays" maxLength={80}
          className="w-full bg-bg border border-border rounded px-3 py-2.5 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
        <p className="text-[11px] text-muted">
          Custom pacts aren't auto-scored from data — PAX asks about them in the evening wrap and stacks the honest answer.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-blue px-3 py-2">Cancel</button>
          <button disabled={busy || !form.name.trim()} onClick={() => onCreate({ ...form, name: form.name.trim() })}
            className="bg-red text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-2 rounded hover:bg-red-deep transition-colors disabled:opacity-40">
            Create pact
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[10px] font-bold text-muted uppercase tracking-[0.16em] mb-2">The classics</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {available.map((t) => (
          <button key={t.name} disabled={busy}
            onClick={() => onCreate({ name: t.name, metric: t.metric, target_value: t.target_value, cadence: t.cadence, days_per_week: t.metric === 'sessions_per_week' ? t.target_value : undefined })}
            className="flex items-center gap-2.5 text-left bg-white border border-border rounded px-3 py-2.5 hover:border-blue transition-colors disabled:opacity-50">
            <span className="w-7 h-7 bg-bg rounded grid place-items-center font-display font-black text-xs text-blue flex-shrink-0">{t.letter}</span>
            <span className="text-xs font-semibold text-blue leading-tight">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={() => setCustom(true)} className="text-[11px] font-semibold uppercase tracking-wider text-red hover:text-red-deep transition-colors">
          Write a custom pact →
        </button>
        <button onClick={onCancel} className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-blue px-2">Cancel</button>
      </div>
    </div>
  );
}
