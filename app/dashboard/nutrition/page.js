'use client';

// /dashboard/nutrition — set each athlete's nutrition targets. PAX grounds
// every message in these; the athlete's Nutrition-today card scores the day
// against them (green in range, amber/red off).

import { useEffect, useState } from 'react';

const FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', col: 'calorie_target', hint: 'Daily energy target' },
  { key: 'protein',  label: 'Protein',  unit: 'g',    col: 'protein_target', hint: '~1.6–2.2g per kg for most goals' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g',    col: 'carb_target',    hint: 'Fuel around training days' },
  { key: 'fat',      label: 'Fat',      unit: 'g',    col: 'fat_target',     hint: 'Keep ≥0.6g per kg for hormones' },
  { key: 'steps',    label: 'Steps',    unit: '/day', col: 'step_target',    hint: 'The quiet fat-loss lever' },
];

export default function NutritionPage() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState({});
  const [state, setState] = useState('idle');

  async function load() {
    const d = await fetch('/api/nutrition', { cache: 'no-store' }).then((r) => r.json());
    setClients(d.clients || []);
    return d.clients || [];
  }

  useEffect(() => { load().then((cs) => { if (cs.length) setClientId((id) => id || cs[0].id); }); }, []);

  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (!client) return;
    const next = {};
    for (const f of FIELDS) next[f.key] = client[f.col] ?? '';
    setForm(next);
  }, [clientId, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault();
    setState('saving');
    const res = await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, ...form }),
    });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) { await load(); setTimeout(() => setState('idle'), 2000); }
  }

  return (
    <div className="p-8 max-w-3xl">
      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Fuel the plan</p>
      <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-1">Nutrition targets</h1>
      <p className="text-body text-sm mb-8">These drive the athlete&apos;s daily nutrition card and everything PAX says about food. Leave a field blank to clear it.</p>

      <form onSubmit={save} className="bg-white rounded-lg shadow-card p-6">
        <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Athlete</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="w-full px-4 py-3 bg-bg border border-border rounded text-blue mb-2">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {client && (
          <p className="text-xs text-muted mb-5">
            {client.current_weight ? `Current weight ${Number(client.current_weight).toFixed(1)}kg` : ''}
            {client.goal ? ` · goal: ${String(client.goal).replace(/_/g, ' ')}` : ''}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-1">
                {f.label} <span className="text-muted normal-case font-semibold">({f.unit})</span>
              </label>
              <input type="number" min="0" value={form[f.key] ?? ''} placeholder="—"
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full px-4 py-3 bg-bg border border-border rounded text-blue" />
              <p className="text-[11px] text-muted mt-1">{f.hint}</p>
            </div>
          ))}
        </div>

        <button type="submit" disabled={state === 'saving'}
          className="w-full bg-red text-white font-semibold uppercase tracking-wider text-xs py-3.5 rounded hover:bg-red-deep disabled:opacity-60">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved — live for the athlete & PAX' : state === 'error' ? 'Could not save — try again' : 'Save targets →'}
        </button>
      </form>
    </div>
  );
}
