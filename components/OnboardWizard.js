'use client';

import { useState } from 'react';

const GOALS = [
  { slug: 'fat_loss', label: 'Lose fat', sub: 'Lean down, hold strength' },
  { slug: 'muscle_gain', label: 'Build muscle', sub: 'Add size and strength' },
  { slug: 'maintain', label: 'Maintain & feel good', sub: 'Stay consistent and healthy' },
  { slug: 'performance', label: 'Perform', sub: 'Train for an event or sport' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIMES = ['Mornings', 'Lunchtime', 'Evenings', 'It varies'];
const EQUIPMENT = ['Barbell & plates', 'Dumbbells', 'Squat rack', 'Bench', 'Cable machine', 'Kettlebells', 'Resistance bands', 'Cardio machines', 'Bodyweight only'];
const EXPERIENCE = ['Beginner', 'Intermediate', 'Advanced'];
const STYLES = ['Strength', 'Hypertrophy', 'Hybrid', 'Running / endurance', 'General fitness'];

const STEPS = ['You', 'Goal', 'Your week', 'Where you train', 'The basics', 'Stay connected'];

export default function OnboardWizard({ token, coachName, clientName, clientPhone }) {
  const [step, setStep] = useState(0); // 0 = welcome, 1..6 = STEPS, then done
  const [form, setForm] = useState({
    name: clientName || '',
    email: '',
    goal: '',
    event_name: '',
    event_date: '',
    training_days: [],
    training_time: '',
    gym: '',
    equipment_list: [],
    current_weight: '',
    target_weight: '',
    experience_level: '',
    training_style: '',
    injuries: '',
    whatsapp_phone: clientPhone || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, v) => setForm((f) => {
    const arr = f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v];
    return { ...f, [k]: arr };
  });

  const canAdvance = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return !!form.goal;
    return true;
  };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, form }),
      });
      const text = await res.text();
      let j = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
      if (!res.ok || !j.ok) throw new Error(j.error || `Something went wrong (${res.status}).`);
      setDone(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Shell coachName={coachName}>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white grid place-items-center text-2xl font-bold mx-auto mb-5">✓</div>
          <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight leading-none mb-3">You're all set</h1>
          <p className="text-body text-sm leading-relaxed mb-2">
            Nice one{form.name ? `, ${form.name.split(' ')[0]}` : ''}. Your profile's with {coachName} now.
          </p>
          <p className="text-muted text-sm leading-relaxed">
            PAX — your accountability companion — will say hello on WhatsApp once {coachName} connects you. Nothing else to do for now.
          </p>
        </div>
      </Shell>
    );
  }

  const total = STEPS.length;

  return (
    <Shell coachName={coachName}>
      {step > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-muted tracking-[0.18em] uppercase">Step {step} of {total}</span>
            <span className="text-[10px] font-bold text-red tracking-[0.18em] uppercase">{STEPS[step - 1]}</span>
          </div>
          <div className="h-1.5 bg-bg rounded-full overflow-hidden">
            <div className="h-full bg-red rounded-full transition-all duration-300" style={{ width: `${(step / total) * 100}%` }} />
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="text-center py-4">
          <p className="text-[11px] font-semibold text-red tracking-[0.2em] uppercase mb-3">You're invited</p>
          <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight leading-none mb-4">
            Let's set up<br />your coaching
          </h1>
          <p className="text-body text-sm leading-relaxed mb-1">
            {coachName} has invited you to PACT.Health — the platform that keeps you both connected between sessions.
          </p>
          <p className="text-muted text-sm leading-relaxed">Takes about five minutes. Let's go.</p>
        </div>
      )}

      {step === 1 && (
        <Step title="First, the basics" sub="So your coach and PAX know who they're talking to.">
          <Field label="Your name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sarah Mitchell" maxLength={80}
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
          </Field>
          <Field label="Email" optional>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" maxLength={120}
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
          </Field>
        </Step>
      )}

      {step === 2 && (
        <Step title="What are you here for?" sub="Pick the one that fits best — you can refine it with your coach later.">
          <div className="space-y-2.5">
            {GOALS.map((g) => (
              <button key={g.slug} onClick={() => set('goal', g.slug)} type="button"
                className={`w-full text-left rounded-lg border p-4 transition-colors ${form.goal === g.slug ? 'border-red border-2 bg-red/5' : 'border-border bg-white hover:border-blue'}`}>
                <div className="font-display font-bold text-blue text-base">{g.label}</div>
                <div className="text-muted text-xs mt-0.5">{g.sub}</div>
              </button>
            ))}
          </div>
          {form.goal === 'performance' && (
            <div className="mt-4 space-y-4 pt-4 border-t border-border">
              <Field label="Event name" optional>
                <input value={form.event_name} onChange={(e) => set('event_name', e.target.value)} placeholder="e.g. Hyrox London" maxLength={80}
                  className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
              </Field>
              <Field label="Event date" optional>
                <input type="date" value={form.event_date} onChange={(e) => set('event_date', e.target.value)}
                  className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue focus:outline-none focus:border-blue" />
              </Field>
            </div>
          )}
        </Step>
      )}

      {step === 3 && (
        <Step title="How does your week run?" sub="Which days you usually train, and when. PAX uses this to time its check-ins.">
          <Field label="Training days">
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggle('training_days', d)}
                  className={`py-2.5 rounded text-xs font-bold transition-colors ${form.training_days.includes(d) ? 'bg-blue text-white' : 'bg-bg text-muted hover:text-blue'}`}>
                  {d[0]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="When do you prefer to train?" optional>
            <div className="grid grid-cols-2 gap-2">
              {TIMES.map((t) => (
                <button key={t} type="button" onClick={() => set('training_time', t)}
                  className={`py-3 rounded text-sm font-medium transition-colors ${form.training_time === t ? 'bg-blue text-white' : 'bg-bg text-body hover:text-blue'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </Step>
      )}

      {step === 4 && (
        <Step title="Where do you train?" sub="So your programmes only use kit you can actually get to.">
          <Field label="Gym or setup" optional hint="Name your gym, or 'home gym', 'commercial gym', etc.">
            <input value={form.gym} onChange={(e) => set('gym', e.target.value)} placeholder="e.g. PureGym Shoreditch" maxLength={80}
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
          </Field>
          <Field label="What do you have access to?">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((eq) => (
                <button key={eq} type="button" onClick={() => toggle('equipment_list', eq)}
                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-colors ${form.equipment_list.includes(eq) ? 'bg-blue text-white border-blue' : 'bg-white text-body border-border hover:border-blue'}`}>
                  {eq}
                </button>
              ))}
            </div>
          </Field>
        </Step>
      )}

      {step === 5 && (
        <Step title="A few specifics" sub="All optional — but the more PAX knows, the sharper it gets.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current weight">
              <input type="number" inputMode="decimal" value={form.current_weight} onChange={(e) => set('current_weight', e.target.value)} placeholder="80 kg"
                className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
            </Field>
            <Field label="Target weight">
              <input type="number" inputMode="decimal" value={form.target_weight} onChange={(e) => set('target_weight', e.target.value)} placeholder="75 kg"
                className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
            </Field>
          </div>
          <Field label="Experience" optional>
            <div className="grid grid-cols-3 gap-2">
              {EXPERIENCE.map((x) => (
                <button key={x} type="button" onClick={() => set('experience_level', x)}
                  className={`py-3 rounded text-sm font-medium transition-colors ${form.experience_level === x ? 'bg-blue text-white' : 'bg-bg text-body hover:text-blue'}`}>
                  {x}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Training style" optional>
            <select value={form.training_style} onChange={(e) => set('training_style', e.target.value)}
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue focus:outline-none focus:border-blue">
              <option value="">Choose…</option>
              {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Any injuries or things to work around?" optional>
            <textarea value={form.injuries} onChange={(e) => set('injuries', e.target.value)} rows={2} maxLength={500} placeholder="e.g. dodgy left shoulder, avoid overhead press"
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue resize-none" />
          </Field>
        </Step>
      )}

      {step === 6 && (
        <Step title="Stay connected" sub="PAX lives in WhatsApp — no app to download.">
          <Field label="Your WhatsApp number" hint="Include the country code, e.g. +44 7700 900123.">
            <input type="tel" value={form.whatsapp_phone} onChange={(e) => set('whatsapp_phone', e.target.value)} placeholder="+44 7700 900123" maxLength={20}
              className="w-full bg-bg border border-border rounded px-3.5 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue" />
          </Field>
          <div className="bg-bg border-l-[3px] border-blue rounded-r p-4 mt-2">
            <p className="text-body text-xs leading-relaxed">
              You won't hear from PAX straight away. Once {coachName} connects the WhatsApp line, PAX will introduce itself and start keeping you on track between sessions — no spam, no guilt.
            </p>
          </div>
          {error && <div className="bg-red/10 border border-red/30 text-red px-4 py-3 rounded text-sm mt-4">{error}</div>}
        </Step>
      )}

      {/* Footer nav */}
      <div className="flex items-center gap-3 mt-8">
        {step > 0 && !submitting && (
          <button type="button" onClick={() => setStep((s) => s - 1)}
            className="text-xs font-semibold tracking-wider uppercase text-muted hover:text-blue transition-colors px-2">
            ← Back
          </button>
        )}
        <div className="flex-1" />
        {step < total && (
          <button type="button" disabled={!canAdvance()} onClick={() => setStep((s) => s + 1)}
            className="bg-red text-white font-semibold tracking-wider uppercase text-xs px-7 py-3.5 rounded hover:bg-red-deep transition-colors disabled:opacity-40">
            {step === 0 ? "Let's go →" : 'Continue →'}
          </button>
        )}
        {step === total && (
          <button type="button" disabled={submitting} onClick={submit}
            className="bg-red text-white font-semibold tracking-wider uppercase text-xs px-7 py-3.5 rounded hover:bg-red-deep transition-colors disabled:opacity-50">
            {submitting ? 'Setting up…' : 'Finish →'}
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ coachName, children }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center px-5 py-8">
      <div className="flex items-center gap-2.5 mb-7">
        <div className="w-8 h-8 bg-red text-white grid place-items-center font-display font-black text-base rounded">P</div>
        <div className="font-display font-extrabold text-blue text-lg tracking-wide">PACT<span className="text-red">.</span>HEALTH</div>
      </div>
      <div className="bg-white rounded-lg shadow-card border border-border p-6 sm:p-7 max-w-md w-full">
        {children}
      </div>
      <p className="text-muted text-[11px] mt-5 text-center max-w-md">Invited by {coachName} · Your details are shared only with your coach.</p>
    </div>
  );
}

function Step({ title, sub, children }) {
  return (
    <div>
      <h1 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight leading-tight mb-1.5">{title}</h1>
      {sub && <p className="text-muted text-sm leading-relaxed mb-5">{sub}</p>}
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, optional, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-blue tracking-[0.16em] uppercase mb-1.5">
        {label} {optional && <span className="text-muted font-medium normal-case tracking-normal">· optional</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  );
}
