'use client';

/**
 * Daily targets for one athlete, on the athlete page's Settings tab. Replaces
 * the standalone Nutrition targets page and the quick-actions popover. Saves
 * through /api/nutrition; the athlete's app and PAX use them from the next
 * read. A blank field keeps whatever is saved.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './overview.module.css';

const FIELDS = [
  { key: 'protein',  label: 'Protein',  unit: 'g a day' },
  { key: 'calories', label: 'Calories', unit: 'kcal a day' },
  { key: 'steps',    label: 'Steps',    unit: 'a day' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g a day' },
  { key: 'fat',      label: 'Fat',      unit: 'g a day' },
];

export default function TargetsEditor({ clientId, firstName, targets = {} }) {
  const router = useRouter();
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, targets[f.key] ?? ''])));
  const [state, setState] = useState('idle');

  async function save(e) {
    e.preventDefault();
    setState('saving');
    try {
      const res = await fetch('/api/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...form }),
      });
      setState(res.ok ? 'saved' : 'error');
      if (res.ok) router.refresh();
    } catch {
      setState('error');
    }
  }

  return (
    <form onSubmit={save} className={s.card} aria-labelledby="targets-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 id="targets-h" className={s.h} style={{ fontSize: 15 }}>Daily targets</h2>
        <p className="mt-1 mb-0 text-[13px] text-[#5B6B7F]">{firstName}’s app and PAX use these as soon as you save.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`t-${f.key}`} className="block text-[13px] font-semibold text-blue mb-1">
              {f.label} <span className="text-[#5B6B7F] font-normal">{f.unit}</span>
            </label>
            <input
              id={`t-${f.key}`}
              type="number"
              inputMode="numeric"
              min="0"
              value={form[f.key]}
              onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setState('idle'); }}
              className="w-full min-h-[44px] px-3 bg-bg border border-border text-blue text-[15px] focus:outline-none focus:border-blue"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === 'saving'} className="min-h-[44px] px-5 bg-red text-white text-[14px] font-semibold hover:bg-red-deep disabled:opacity-50">
          {state === 'saving' ? 'Saving…' : 'Save targets'}
        </button>
        {state === 'saved' && <span role="status" className="text-[14px] text-[#1B6E3A]">Saved.</span>}
        {state === 'error' && <span role="alert" className="text-[14px] text-[#B42318]">Couldn’t save. Try again.</span>}
      </div>
    </form>
  );
}
