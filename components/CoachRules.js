'use client';

/**
 * Coach rules: the boundaries PAX works inside. Applied by the engine to
 * every scheduled message from the next one sent.
 */
import { useEffect, useState } from 'react';

const MODES = [
  { id: 'auto', label: 'Send automatically', sub: 'PAX sends on schedule. You see everything it sent.' },
  { id: 'review_nudges', label: 'Hold midday nudges for me', sub: 'Morning and evening go out; midday waits in Needs you today.' },
  { id: 'review_all', label: 'Hold everything for me', sub: 'Nothing goes out until you approve it. Best for your first week.' },
];

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

const input = 'w-full border border-border rounded px-3 py-2 text-sm text-blue focus:outline-none focus:border-blue';

export default function CoachRules() {
  const [r, setR] = useState(null);
  const [topic, setTopic] = useState('');
  const [state, setState] = useState({ saving: false, msg: null, ok: true });

  useEffect(() => {
    fetch('/api/settings/rules', { cache: 'no-store' })
      .then((res) => res.json().then((j) => (res.ok ? setR(j) : setState({ saving: false, msg: j.error || 'Could not load your rules.', ok: false }))))
      .catch(() => setState({ saving: false, msg: 'Could not load your rules.', ok: false }));
  }, []);

  if (!r) return <div className="bg-white rounded-lg shadow-card border border-border p-5 text-sm text-muted">{state.msg || 'Loading…'}</div>;

  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const setWindow = (k, v) => setR((x) => ({ ...x, windows: { ...x.windows, [k]: v } }));
  const addTopic = () => {
    const t = topic.trim().toLowerCase();
    if (t.length >= 2 && !r.neverTopics.includes(t)) set({ neverTopics: [...r.neverTopics, t] });
    setTopic('');
  };

  async function save() {
    setState({ saving: true, msg: null, ok: true });
    const res = await fetch('/api/settings/rules', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
    const j = await res.json().catch(() => ({}));
    setState({ saving: false, ok: res.ok, msg: res.ok ? 'Saved. Applies from the next message PAX sends.' : (j.issues || [j.error || 'Could not save.']).join('; ') });
  }

  return (
    <div className="bg-white rounded-lg shadow-card border border-border p-5 space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue mb-3">When PAX messages your athletes</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Morning"><input type="time" className={input} value={r.windows.morning} onChange={(e) => setWindow('morning', e.target.value)} /></Field>
          <Field label="Midday"><input type="time" className={input} value={r.windows.midday} onChange={(e) => setWindow('midday', e.target.value)} /></Field>
          <Field label="Evening"><input type="time" className={input} value={r.windows.evening} onChange={(e) => setWindow('evening', e.target.value)} /></Field>
        </div>
        <p className="text-[11px] text-muted mt-2">Midday only goes out when there’s something worth saying.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Quiet from"><input type="time" className={input} value={r.quietStart} onChange={(e) => set({ quietStart: e.target.value })} /></Field>
        <Field label="Quiet until"><input type="time" className={input} value={r.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} /></Field>
        <Field label="Max a day" hint="Scheduled messages per athlete">
          <input type="number" min={0} max={12} className={input} value={r.maxDailyTouches} onChange={(e) => set({ maxDailyTouches: Math.max(0, Math.min(12, Number(e.target.value) || 0)) })} />
        </Field>
      </div>

      <Field label="Never raise" hint="PAX won’t bring these up, and a message that does is rewritten before it goes. If an athlete raises one, PAX points them to you.">
        <div className="flex flex-wrap gap-2 mb-2">
          {r.neverTopics.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-bg-alt text-blue px-2.5 py-1 rounded">
              {t}
              <button aria-label={`Remove ${t}`} className="text-muted hover:text-red" onClick={() => set({ neverTopics: r.neverTopics.filter((x) => x !== t) })}>×</button>
            </span>
          ))}
          {!r.neverTopics.length && <span className="text-xs text-muted">Nothing yet. e.g. weight, alcohol, calories</span>}
        </div>
        <div className="flex gap-2">
          <input className={input} value={topic} placeholder="Add a topic" onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }} />
          <button onClick={addTopic} className="text-xs font-semibold px-3 rounded border border-border text-blue hover:border-blue">Add</button>
        </div>
      </Field>

      <div>
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted">Approval</span>
        <div className="mt-2 space-y-2">
          {MODES.map((m) => (
            <label key={m.id} className={`flex gap-3 items-start border rounded p-3 cursor-pointer ${r.approvalMode === m.id ? 'border-blue bg-bg' : 'border-border'}`}>
              <input type="radio" name="approval" className="mt-1" checked={r.approvalMode === m.id} onChange={() => set({ approvalMode: m.id })} />
              <span>
                <span className="block text-sm font-semibold text-blue">{m.label}</span>
                <span className="block text-xs text-muted mt-0.5">{m.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={state.saving} className="text-sm font-semibold px-4 py-2 rounded bg-red text-white hover:bg-red-deep disabled:opacity-50">
          {state.saving ? 'Saving…' : 'Save rules'}
        </button>
        {state.msg && <span className={`text-xs ${state.ok ? 'text-blue' : 'text-red'}`}>{state.msg}</span>}
      </div>
    </div>
  );
}
