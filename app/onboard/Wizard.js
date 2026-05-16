'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================
// Wizard — 6-step onboarding for new athletes
// ============================================================
export default function Wizard({ token, pt, prefill }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [data, setData] = useState({
    // Step 1
    name:  prefill.name  || '',
    phone: prefill.phone || '',

    // Step 2
    goal: '',
    goal_motivation: '',

    // Step 3
    current_weight: '',
    target_weight:  '',
    target_date:    '',
    has_event:      false,
    event_name:     '',
    event_date:     '',

    // Step 4
    experience_level: '',
    training_style:   '',
    training_days:    [],
    training_time:    '',
    gym:              '',
    injuries:         '',

    // Step 5 — all optional
    squat_max:    '',
    bench_press_max: '',
    deadlift_max: '',
    ohp_max:      '',
  });

  // ============================================================
  // Validation
  // ============================================================
  function canContinue() {
    switch (step) {
      case 1: return data.name.trim().length > 0;
      case 2: return !!data.goal;
      case 3: return parseFloat(data.current_weight) > 0 && parseFloat(data.target_weight) > 0;
      case 4: return !!data.experience_level && !!data.training_style && data.training_days.length > 0;
      case 5: return true; // skippable
      default: return false;
    }
  }

  function update(patch) {
    setData(d => ({ ...d, ...patch }));
  }

  function toggleDay(day) {
    setData(d => ({
      ...d,
      training_days: d.training_days.includes(day)
        ? d.training_days.filter(x => x !== day)
        : [...d.training_days, day],
    }));
  }

  // ============================================================
  // Submit
  // ============================================================
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboard/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Submit failed');
      setStep(6); // Move to done screen
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ============================================================
  // Render
  // ============================================================
  const totalSteps = 5;
  const progressPct = step <= totalSteps ? (step / totalSteps) * 100 : 100;

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* Sticky header with brand + progress */}
      <header className="bg-blue text-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-red text-white grid place-items-center font-display font-black rounded">
            P
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-sm tracking-wide leading-none">
              PACT<span className="text-red">.</span>HEALTH
            </div>
            <div className="text-[10px] font-semibold text-white/50 tracking-[0.15em] uppercase mt-0.5">
              {pt.business_name || `with ${pt.name}`}
            </div>
          </div>
          {step <= totalSteps && (
            <div className="text-[10px] font-bold text-white/60 tracking-wider tabular-nums">
              {step}/{totalSteps}
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-red transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 lg:py-12">

        {step === 1 && <StepWelcome  data={data} update={update} pt={pt} />}
        {step === 2 && <StepGoal     data={data} update={update} />}
        {step === 3 && <StepBody     data={data} update={update} />}
        {step === 4 && <StepTraining data={data} update={update} toggleDay={toggleDay} />}
        {step === 5 && <StepLifts    data={data} update={update} />}
        {step === 6 && <StepDone     data={data} pt={pt} />}

        {error && (
          <div className="bg-red/10 border border-red/30 text-red px-4 py-3 rounded text-sm mt-5">
            {error}
          </div>
        )}
      </main>

      {/* Footer with back/continue */}
      {step <= totalSteps && (
        <footer className="bg-white border-t border-border sticky bottom-0">
          <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-xs font-semibold tracking-wider uppercase text-muted hover:text-blue transition-colors px-2 py-2"
              >
                ← Back
              </button>
            ) : <div />}

            {step < totalSteps ? (
              <button
                disabled={!canContinue()}
                onClick={() => setStep(s => s + 1)}
                className="bg-red text-white font-semibold tracking-wider uppercase text-xs px-6 py-3 rounded hover:bg-red-deep transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            ) : (
              <button
                disabled={submitting || !canContinue()}
                onClick={submit}
                className="bg-red text-white font-semibold tracking-wider uppercase text-xs px-6 py-3 rounded hover:bg-red-deep transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Finish & meet PAX →'}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

// ============================================================
// Step components
// ============================================================
function StepWelcome({ data, update, pt }) {
  return (
    <>
      <Eyebrow>Step 1 · Welcome</Eyebrow>
      <Headline>
        Hi {data.name ? data.name.split(' ')[0] : 'there'}.<br/>
        I'm <span className="text-red">PAX</span>.
      </Headline>
      <p className="text-base text-body leading-relaxed mb-7">
        I work alongside <strong>{pt.name}</strong> to keep you accountable between your sessions. I'll check in with you a few times a day, keep tabs on what's working, and make sure the hours between sessions add up.
      </p>
      <p className="text-sm text-muted mb-6">
        Takes about 5 minutes. Let's start with what you're called.
      </p>

      <Field label="Your name">
        <input
          type="text"
          value={data.name}
          onChange={e => update({ name: e.target.value })}
          placeholder="First and last"
          autoFocus
          className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
        />
      </Field>
    </>
  );
}

function StepGoal({ data, update }) {
  const goals = [
    { value: 'cut',       label: 'Cut',       desc: 'Lose weight, lean down' },
    { value: 'build',     label: 'Build',     desc: 'Gain muscle, get bigger' },
    { value: 'maintain',  label: 'Maintain',  desc: 'Stay here, get stronger' },
    { value: 'perform',   label: 'Perform',   desc: 'Train for a specific event' },
  ];
  return (
    <>
      <Eyebrow>Step 2 · Goal</Eyebrow>
      <Headline>What does success look like?</Headline>
      <p className="text-sm text-muted mb-6">
        Pick the closest fit. You can refine the details with your coach.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {goals.map(g => (
          <button
            key={g.value}
            onClick={() => update({ goal: g.value })}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              data.goal === g.value
                ? 'border-red bg-red/5'
                : 'border-border bg-white hover:border-blue'
            }`}
          >
            <div className="font-display font-bold text-blue text-base uppercase tracking-wide mb-1">
              {g.label}
            </div>
            <div className="text-xs text-muted">{g.desc}</div>
          </button>
        ))}
      </div>

      <Field label="In your words, what does success look like?" optional>
        <textarea
          value={data.goal_motivation}
          onChange={e => update({ goal_motivation: e.target.value })}
          placeholder="e.g. Hit 90kg by summer. Squat 130. Run a 10k under 50 mins."
          rows={3}
          className="w-full bg-bg border border-border rounded px-4 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors resize-none"
        />
      </Field>
    </>
  );
}

function StepBody({ data, update }) {
  return (
    <>
      <Eyebrow>Step 3 · Body & journey</Eyebrow>
      <Headline>The numbers.</Headline>
      <p className="text-sm text-muted mb-6">
        Rough is fine — PAX will sharpen these with weekly weigh-ins.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Field label="Current weight (kg)">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={data.current_weight}
            onChange={e => update({ current_weight: e.target.value })}
            placeholder="e.g. 85.5"
            className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
          />
        </Field>
        <Field label="Target weight (kg)">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={data.target_weight}
            onChange={e => update({ target_weight: e.target.value })}
            placeholder="e.g. 78"
            className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
          />
        </Field>
      </div>

      <Field label="Target date" optional hint="When are you aiming to hit it?">
        <input
          type="date"
          value={data.target_date}
          onChange={e => update({ target_date: e.target.value })}
          className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue focus:outline-none focus:border-blue transition-colors"
        />
      </Field>

      <div className="mt-6 pt-6 border-t border-border">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.has_event}
            onChange={e => update({ has_event: e.target.checked })}
            className="w-5 h-5 accent-red"
          />
          <span className="text-sm font-semibold text-blue">
            Training for a specific event?
          </span>
        </label>

        {data.has_event && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Event">
              <input
                type="text"
                value={data.event_name}
                onChange={e => update({ event_name: e.target.value })}
                placeholder="e.g. Hyrox London"
                className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
              />
            </Field>
            <Field label="Event date">
              <input
                type="date"
                value={data.event_date}
                onChange={e => update({ event_date: e.target.value })}
                className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue focus:outline-none focus:border-blue transition-colors"
              />
            </Field>
          </div>
        )}
      </div>
    </>
  );
}

function StepTraining({ data, update, toggleDay }) {
  const days = [
    { d: 'Mon', l: 'M' }, { d: 'Tue', l: 'T' }, { d: 'Wed', l: 'W' },
    { d: 'Thu', l: 'T' }, { d: 'Fri', l: 'F' }, { d: 'Sat', l: 'S' },
    { d: 'Sun', l: 'S' },
  ];

  return (
    <>
      <Eyebrow>Step 4 · Training</Eyebrow>
      <Headline>Tell me how you train.</Headline>

      <Field label="Experience">
        <div className="grid grid-cols-3 gap-2">
          {['beginner', 'intermediate', 'advanced'].map(lvl => (
            <button
              key={lvl}
              onClick={() => update({ experience_level: lvl })}
              className={`py-3 rounded border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                data.experience_level === lvl
                  ? 'border-red bg-red/5 text-blue'
                  : 'border-border bg-white text-muted hover:border-blue hover:text-blue'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Training style">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { v: 'strength',    l: 'Strength' },
            { v: 'hypertrophy', l: 'Hypertrophy' },
            { v: 'hybrid',      l: 'Hybrid' },
            { v: 'hyrox',       l: 'Hyrox' },
            { v: 'running',     l: 'Running' },
            { v: 'general',     l: 'General fitness' },
          ].map(s => (
            <button
              key={s.v}
              onClick={() => update({ training_style: s.v })}
              className={`py-3 rounded border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                data.training_style === s.v
                  ? 'border-red bg-red/5 text-blue'
                  : 'border-border bg-white text-muted hover:border-blue hover:text-blue'
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Days you train">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map(({ d, l }) => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`aspect-square rounded border-2 font-display font-bold text-sm transition-all ${
                data.training_days.includes(d)
                  ? 'border-red bg-red text-white'
                  : 'border-border bg-white text-muted hover:border-blue'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Time of day" optional>
        <div className="grid grid-cols-3 gap-2">
          {['morning', 'midday', 'evening'].map(t => (
            <button
              key={t}
              onClick={() => update({ training_time: t })}
              className={`py-3 rounded border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                data.training_time === t
                  ? 'border-red bg-red/5 text-blue'
                  : 'border-border bg-white text-muted hover:border-blue hover:text-blue'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Gym" optional hint="Where do you usually train?">
        <input
          type="text"
          value={data.gym}
          onChange={e => update({ gym: e.target.value })}
          placeholder="e.g. PureGym Holborn"
          className="w-full bg-bg border border-border rounded px-4 py-3 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
        />
      </Field>

      <Field label="Injuries or watch-outs" optional hint="Anything PAX should keep in mind">
        <textarea
          value={data.injuries}
          onChange={e => update({ injuries: e.target.value })}
          placeholder="e.g. Right shoulder — no heavy overhead pressing"
          rows={2}
          className="w-full bg-bg border border-border rounded px-4 py-3 text-sm text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors resize-none"
        />
      </Field>
    </>
  );
}

function StepLifts({ data, update }) {
  return (
    <>
      <Eyebrow>Step 5 · Current lifts</Eyebrow>
      <Headline>Where are your lifts at?</Headline>
      <p className="text-sm text-muted mb-6">
        Best for around 5 reps. Skip any you're not sure about — PAX will figure it out as we go.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <LiftField label="Squat"    value={data.squat_max}        onChange={v => update({ squat_max: v })} />
        <LiftField label="Bench"    value={data.bench_press_max}  onChange={v => update({ bench_press_max: v })} />
        <LiftField label="Deadlift" value={data.deadlift_max}     onChange={v => update({ deadlift_max: v })} />
        <LiftField label="OHP"      value={data.ohp_max}          onChange={v => update({ ohp_max: v })} />
      </div>
    </>
  );
}

function LiftField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="w-full bg-bg border border-border rounded px-4 py-3 pr-10 text-base text-blue placeholder:text-muted focus:outline-none focus:border-blue transition-colors"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted font-semibold">kg</span>
      </div>
    </Field>
  );
}

function StepDone({ data, pt }) {
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 bg-emerald-500 text-white rounded-full grid place-items-center mx-auto mb-6 text-3xl">
        ✓
      </div>
      <Eyebrow>You're in</Eyebrow>
      <Headline>Welcome to the pact, {data.name.split(' ')[0]}.</Headline>
      <p className="text-base text-body leading-relaxed mb-4 max-w-md mx-auto">
        I've sent your profile to <strong>{pt.name}</strong>. They can see everything now and will start thinking through your week.
      </p>
      <p className="text-sm text-muted max-w-md mx-auto">
        I'll be in touch over WhatsApp shortly with your first check-in. For now — close this tab and get on with your day.
      </p>
    </div>
  );
}

// ============================================================
// Shared primitives
// ============================================================
function Eyebrow({ children }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-red mb-3">
      {children}
    </p>
  );
}

function Headline({ children }) {
  return (
    <h1 className="font-display font-extrabold text-blue text-3xl lg:text-4xl uppercase tracking-tight leading-[1.05] mb-4">
      {children}
    </h1>
  );
}

function Field({ label, hint, optional, children }) {
  return (
    <div className="mb-5">
      <label className="block text-[10px] font-bold text-blue tracking-[0.18em] uppercase mb-1.5">
        {label} {optional && <span className="text-muted font-medium normal-case tracking-normal"> · optional</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  );
}
