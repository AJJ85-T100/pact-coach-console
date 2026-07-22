'use client';

// ============================================================
// AthleteQuickActions — inline coach tools for the athlete page.
// Sits in the quick-actions strip: Nutrition targets and Send
// note open small inline panels right there, posting to the
// existing /api/nutrition and /api/notes routes. Programmes and
// pacts already live on this page (strip links + PactsPanel).
// ============================================================

import { useState } from 'react';

const FIELDS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein',  label: 'Protein',  unit: 'g' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g' },
  { key: 'fat',      label: 'Fat',      unit: 'g' },
  { key: 'steps',    label: 'Steps',    unit: '/day' },
];

export default function AthleteQuickActions({ clientId, targets = {} }) {
  const [open, setOpen] = useState(null); // null | 'nutrition' | 'note'
  const [form, setForm] = useState({
    calories: targets.calories ?? '', protein: targets.protein ?? '',
    carbs: targets.carbs ?? '', fat: targets.fat ?? '', steps: targets.steps ?? '',
  });
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [state, setState] = useState('idle');

  const btn = (active) =>
    `inline-flex items-center gap-2 px-4 py-2 rounded text-[11px] font-bold tracking-[0.12em] uppercase transition-colors ${
      active ? 'bg-blue text-white' : 'bg-white border border-border text-blue hover:border-blue'
    }`;

  async function saveNutrition(e) {
    e.preventDefault();
    setState('saving');
    const res = await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, ...form }),
    });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) setTimeout(() => { setState('idle'); setOpen(null); }, 1400);
  }

  async function sendNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setState('saving');
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, body: note, urgent }),
    });
    setState(res.ok ? 'saved' : 'error');
    if (res.ok) { setNote(''); setUrgent(false); setTimeout(() => { setState('idle'); setOpen(null); }, 1400); }
  }

  return (
    <>
      <button type="button" className={btn(open === 'nutrition')} onClick={() => setOpen(open === 'nutrition' ? null : 'nutrition')}>
        Nutrition targets
      </button>
      <button type="button" className={btn(open === 'note')} onClick={() => setOpen(open === 'note' ? null : 'note')}>
        Send note
      </button>

      {open === 'nutrition' && (
        <form onSubmit={saveNutrition} className="w-full bg-white rounded-lg shadow-card p-5 mt-1">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-red mb-3">
            Nutrition targets — live for the athlete &amp; PAX the moment you save
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-[10px] font-bold tracking-[0.12em] uppercase text-blue mb-1">
                  {f.label} <span className="text-muted font-semibold normal-case">({f.unit})</span>
                </label>
                <input type="number" min="0" value={form[f.key]} placeholder="—"
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded text-blue text-sm" />
              </div>
            ))}
          </div>
          <button type="submit" disabled={state === 'saving'}
            className="bg-red text-white font-semibold uppercase tracking-wider text-[11px] py-2.5 px-5 rounded hover:bg-red-deep disabled:opacity-60">
            {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Retry' : 'Save targets →'}
          </button>
        </form>
      )}

      {open === 'note' && (
        <form onSubmit={sendNote} className="w-full bg-white rounded-lg shadow-card p-5 mt-1">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-red mb-3">
            Note — lands pinned on their dashboard
          </p>
          <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Watch the weekend — front-load protein Saturday."
            className="w-full px-3 py-2 bg-bg border border-border rounded text-blue text-sm mb-3" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent
            </label>
            <button type="submit" disabled={state === 'saving' || !note.trim()}
              className="bg-red text-white font-semibold uppercase tracking-wider text-[11px] py-2.5 px-5 rounded hover:bg-red-deep disabled:opacity-60">
              {state === 'saving' ? 'Sending…' : state === 'saved' ? '✓ Sent' : 'Send note →'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
