'use client';

import { useState } from 'react';

/**
 * VoiceCalibration — the coach teaches PAX how they talk.
 *
 * Four sliders, three free-text fields, a live sample (regenerated on
 * demand so the coach hears the voice before saving), and save. The
 * profile lands on personal_trainers.voice_calibration and flows into
 * every PAX message via the bot's voiceSection().
 */

const SLIDERS = [
  { key: 'tough_love', left: 'Encouraging', right: 'Tough love' },
  { key: 'technical', left: 'Plain language', right: 'Technical' },
  { key: 'formality', left: 'Casual', right: 'Polished' },
  { key: 'brevity', left: 'Brief', right: 'Explanatory' },
];

const DEFAULTS = { tough_love: 50, technical: 50, formality: 50, brevity: 50, phrases: '', never_say: '', notes: '' };

export default function VoiceCalibration({ initial }) {
  const [v, setV] = useState({ ...DEFAULTS, ...(initial || {}) });
  const [sample, setSample] = useState(null);
  const [sampling, setSampling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, val) => { setV((f) => ({ ...f, [k]: val })); setSaved(false); };

  async function generateSample() {
    setSampling(true); setError(null);
    try {
      const res = await fetch('/api/settings/voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_calibration: v }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not generate a sample.');
      setSample(j.sample);
    } catch (e) {
      setError(e.message);
    } finally {
      setSampling(false);
    }
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/settings/voice', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_calibration: v }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save.');
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-lg p-5">
        <h3 className="font-display font-extrabold text-blue text-xs uppercase tracking-wide mb-1">How you talk</h3>
        <p className="text-muted text-xs mb-5 leading-relaxed">
          Drag each slider toward the way you actually coach. The middle means &quot;no strong preference&quot; — PAX uses its default there.
        </p>
        <div className="space-y-5">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider mb-1.5">
                <span className={v[s.key] < 35 ? 'text-red' : 'text-muted'}>{s.left}</span>
                <span className={v[s.key] > 65 ? 'text-red' : 'text-muted'}>{s.right}</span>
              </div>
              <input type="range" min={0} max={100} value={v[s.key]}
                onChange={(e) => set(s.key, parseInt(e.target.value, 10))}
                className="w-full accent-[#D92D20]" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg p-5 space-y-4">
        <h3 className="font-display font-extrabold text-blue text-xs uppercase tracking-wide">In your own words</h3>
        <Field label="Phrases you actually use" hint="PAX weaves these in sparingly — never every message.">
          <textarea value={v.phrases || ''} onChange={(e) => set('phrases', e.target.value)} rows={2} maxLength={400}
            placeholder={`e.g. "trust the block", "let's get after it", "good honest week"`}
            className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-none" />
        </Field>
        <Field label="Things you'd never say">
          <textarea value={v.never_say || ''} onChange={(e) => set('never_say', e.target.value)} rows={2} maxLength={400}
            placeholder={`e.g. "smash it", "no excuses", anything American`}
            className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-none" />
        </Field>
        <Field label="Anything else about how you talk" hint="Optional — accent on the page, humour, pet topics.">
          <textarea value={v.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={600}
            placeholder="e.g. Dry humour, Yorkshire directness, always signs off short"
            className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-none" />
        </Field>
      </div>

      <div className="bg-blue rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-extrabold text-white text-xs uppercase tracking-wide">Hear it</h3>
          <button onClick={generateSample} disabled={sampling}
            className="text-[11px] font-semibold uppercase tracking-wider text-white border border-white/40 rounded px-3.5 py-2 hover:bg-white hover:text-blue transition-colors disabled:opacity-50">
            {sampling ? 'Writing…' : sample ? 'Regenerate' : 'Generate a sample morning'}
          </button>
        </div>
        {sample ? (
          <div className="bg-[#EBF1F5] rounded-lg rounded-bl-[2px] px-4 py-3 text-sm text-blue leading-relaxed whitespace-pre-wrap max-w-xl">
            {sample}
          </div>
        ) : (
          <p className="text-white/60 text-xs">A sample PAX morning message, written in your voice, for a fictional client. Adjust the sliders and regenerate until it sounds like you.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          {error && <p className="text-red text-xs">{error}</p>}
          {saved && !error && <p className="text-emerald-600 text-xs font-semibold">Saved — every PAX message now carries your voice.</p>}
        </div>
        <button onClick={save} disabled={saving}
          className="bg-red text-white text-xs font-semibold uppercase tracking-wider px-6 py-3 rounded hover:bg-red-deep transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save voice'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-blue tracking-[0.16em] uppercase mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  );
}
