'use client';

/**
 * Focus and phase — the coach sets which way is good for this athlete (phase +
 * target pace) and the one habit that leads their month. Saved to the engine
 * (PUT /v1/coach/athletes/:id/plan); PAX mentions it in the next morning brief.
 */
import { useEffect, useState } from 'react';
import ov from './overview.module.css';
import s from './focusPhase.module.css';

export const PHASES = [
  { id: 'cut', name: 'Cut', sub: 'Weight down is good', pace: 0.5, unit: 'kg a week', note: 'Weight going down shows as progress.' },
  { id: 'bulk', name: 'Bulk', sub: 'Weight up is good', pace: 0.25, unit: 'kg a week', note: 'Weight going up shows as progress; a fast gain is flagged to you.' },
  { id: 'maintain', name: 'Maintain', sub: 'Holding steady is good', pace: 0.5, unit: '± kg', note: 'Staying inside the band shows as progress.' },
  { id: 'recomp', name: 'Recomp', sub: 'Strength leads', pace: null, unit: null, note: 'Weight is shown neutrally; strength is the headline.' },
];
const WEEKS = [4, 6, 8];
const MAX_LABEL = 60;

export const fmtDay = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Form state from the engine's plan. Pace is shown unsigned; the phase gives the sign. */
function fromPlan(plan) {
  const preset = plan?.focus && (plan.presets || []).find((p) => p.id === plan.focus.id);
  return {
    phase: plan?.phase || null,
    pace: plan?.targetPace != null && plan?.phase !== 'recomp' ? String(Math.abs(plan.targetPace)) : '',
    focusId: plan?.focus?.id || null,
    label: plan?.focus?.label || preset?.label || '',
    weeks: WEEKS.includes(plan?.focus?.weeks) ? plan.focus.weeks : 4,
  };
}

function toBody(f, presets) {
  const pace = Number(String(f.pace).replace(',', '.'));
  let targetPace = null;
  if (f.phase === 'cut') targetPace = -Math.abs(pace);
  else if (f.phase === 'bulk' || f.phase === 'maintain') targetPace = Math.abs(pace);
  const body = { phase: f.phase, targetPace, focusId: f.focusId, focusWeeks: f.weeks };
  const preset = presets.find((p) => p.id === f.focusId);
  const label = f.label.trim();
  if (f.focusId && label && label !== preset?.label) body.focusLabel = label.slice(0, MAX_LABEL);
  return body;
}

function paceError(f) {
  if (!f.phase || f.phase === 'recomp') return null;
  const n = Number(String(f.pace).replace(',', '.'));
  if (String(f.pace).trim() === '' || !Number.isFinite(n) || n <= 0) return 'Enter a target pace above 0.';
  if (n > 2) return 'That pace is over 2 kg; check the number.';
  return null;
}

export default function FocusPhase({ clientId, firstName }) {
  const [plan, setPlan] = useState(null);
  const [f, setF] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [st, setSt] = useState({ saving: false, ok: null, msg: null });

  useEffect(() => {
    let live = true;
    fetch(`/api/athletes/${encodeURIComponent(clientId)}/plan`, { cache: 'no-store' })
      .then((res) => res.json().then((j) => {
        if (!live) return;
        if (res.ok) { setPlan(j); setF(fromPlan(j)); } else setLoadErr(j.error || 'Could not load the plan.');
      }))
      .catch(() => live && setLoadErr('Could not reach the PACT engine.'));
    return () => { live = false; };
  }, [clientId]);

  if (!f) {
    return (
      <section className={ov.card} aria-labelledby="fp-phase">
        <h2 id="fp-phase" className={ov.h} style={{ fontSize: 15 }}>Focus and phase</h2>
        <p className={loadErr ? s.err : s.hint} style={{ marginTop: 10 }} role={loadErr ? 'alert' : undefined}>{loadErr || 'Loading…'}</p>
      </section>
    );
  }

  const presets = plan?.presets || [];
  const phase = PHASES.find((p) => p.id === f.phase) || null;
  const baseline = JSON.stringify(toBody(fromPlan(plan), presets));
  const dirty = JSON.stringify(toBody(f, presets)) !== baseline;
  const pErr = paceError(f);
  const labelTooLong = f.label.trim().length > MAX_LABEL;
  const canSave = dirty && !st.saving && !pErr && !labelTooLong;

  const edit = (patch) => { setF((x) => ({ ...x, ...patch })); setSt({ saving: false, ok: null, msg: null }); };
  const pickPhase = (p) => edit({ phase: p.id, pace: p.pace != null ? String(p.pace) : '' });
  const pickFocus = (id) => edit({ focusId: id, label: presets.find((p) => p.id === id)?.label || '' });

  async function save() {
    setSt({ saving: true, ok: null, msg: null });
    try {
      const res = await fetch(`/api/athletes/${encodeURIComponent(clientId)}/plan`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(toBody(f, presets)),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.plan) {
        setPlan(j.plan); setF(fromPlan(j.plan));
        setSt({ saving: false, ok: true, msg: `Saved. PAX will mention it in ${firstName}’s next morning message.` });
      } else {
        const msg = res.status === 404 ? `${firstName} isn’t on your roster.`
          : j.error === 'invalid_body' ? 'The engine didn’t accept that. Check the pace and wording.'
          : j.error || 'Could not save. Try again.';
        setSt({ saving: false, ok: false, msg });
      }
    } catch {
      setSt({ saving: false, ok: false, msg: 'Could not reach the PACT engine. Nothing was saved.' });
    }
  }

  const running = plan?.focus;

  return (
    <div className="flex flex-col gap-5">
      {/* Phase */}
      <section className={ov.card} aria-labelledby="fp-phase">
        <fieldset className={s.fieldset}>
          <legend className={s.legend}>
            <h2 id="fp-phase" className={ov.h} style={{ fontSize: 15 }}>Phase</h2>
            <span className={ov.lbl} style={{ letterSpacing: '.08em' }}>Sets which way is good</span>
          </legend>
          <div className={s.segs}>
            {PHASES.map((p) => (
              <button key={p.id} type="button" aria-pressed={f.phase === p.id} className={`${s.seg} ${f.phase === p.id ? s.segOn : ''}`} onClick={() => pickPhase(p)}>
                <span style={{ display: 'block' }}>{p.name}</span>
                <span className={s.segSub}>{p.sub}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {phase && phase.unit && (
          <div className={s.row}>
            <label htmlFor="fp-pace" className={s.fieldLbl}>Target pace</label>
            <span className="inline-flex items-center gap-2">
              <input
                id="fp-pace" className={s.input} style={{ width: 96 }} inputMode="decimal" value={f.pace}
                aria-invalid={!!pErr} aria-describedby="fp-pace-note"
                onChange={(e) => edit({ pace: e.target.value })}
              />
              <span className="text-[14px] text-[#5B6B7F]">{phase.unit}</span>
            </span>
            <p id="fp-pace-note" className={pErr ? s.err : s.hint}>{pErr || phase.note}</p>
          </div>
        )}
        {phase && !phase.unit && <p className={s.hint} style={{ marginTop: 14 }}>{phase.note}</p>}
        {!phase && <p className={s.hint} style={{ marginTop: 14 }}>No phase set. Weight shows neutrally until you pick one.</p>}
      </section>

      {/* Focus */}
      <section className={ov.card} aria-labelledby="fp-focus">
        <fieldset className={s.fieldset}>
          <legend className={s.legend}>
            <h2 id="fp-focus" className={ov.h} style={{ fontSize: 15 }}>This month’s focus</h2>
            <span className={ov.lbl} style={{ letterSpacing: '.08em' }}>One habit leads Today</span>
          </legend>
          <p className="m-0 text-[14px] text-[#5B6B7F]" style={{ paddingTop: 8, lineHeight: '20px' }}>
            Pick the one habit that would move {firstName} most. It leads their Today screen and PAX builds the month round it. The other targets stay visible but quieter.
          </p>
          {running && (
            <p className="m-0 mt-2 text-[14px] text-blue font-semibold">
              Running: {running.label} · Week {running.weekNumber} of {running.weeks}, started {fmtDay(running.startedOn)}
            </p>
          )}
          <div className={s.habits}>
            {presets.map((p) => {
              const on = f.focusId === p.id;
              return (
                <label key={p.id} className={`${s.habit} ${on ? s.habitOn : ''}`}>
                  <input type="radio" name="fp-focus" className={s.radio} checked={on} onChange={() => pickFocus(p.id)} />
                  <span className={`${s.dot} ${on ? s.dotOn : ''}`} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className={s.name}>{p.label}</span>
                    <span className={s.anchor}>Anchor: {p.anchorLabel}</span>
                  </span>
                  <span className={s.rate}>{p.rate4w ? `${p.rate4w.hit} of ${p.rate4w.of}` : 'No data yet'}</span>
                </label>
              );
            })}
            <label className={`${s.habit} ${f.focusId === null ? s.habitOn : ''}`}>
              <input type="radio" name="fp-focus" className={s.radio} checked={f.focusId === null} onChange={() => pickFocus(null)} />
              <span className={`${s.dot} ${f.focusId === null ? s.dotOn : ''}`} aria-hidden="true" />
              <span style={{ flex: 1 }}>
                <span className={s.name}>No focus</span>
                <span className={s.anchor}>All targets carry equal weight on Today.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {f.focusId && (
          <>
            <div className={s.row}>
              <label htmlFor="fp-label" className={s.fieldLbl}>Wording the athlete sees</label>
              <input
                id="fp-label" className={s.input} style={{ flex: '1 1 240px', minWidth: 0 }} maxLength={MAX_LABEL}
                value={f.label} aria-describedby="fp-label-note" onChange={(e) => edit({ label: e.target.value })}
              />
              <p id="fp-label-note" className={s.hint}>{f.label.trim().length}/{MAX_LABEL}. Optional: put it in {firstName}’s words.</p>
            </div>
            <div className={s.row}>
              <label htmlFor="fp-weeks" className={s.fieldLbl}>For</label>
              <select id="fp-weeks" className={s.input} value={f.weeks} onChange={(e) => edit({ weeks: Number(e.target.value) })}>
                {WEEKS.map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
              <p className={s.hint} style={{ flex: '1 1 260px' }}>The rate beside each habit is the last 4 weeks. Lowest isn’t always best: pick one {firstName} can win.</p>
            </div>
          </>
        )}
      </section>

      <div className="flex gap-2.5 items-center flex-wrap">
        <button type="button" className={`${ov.btn} ${ov.btnRed}`} disabled={!canSave} onClick={save}>
          {st.saving ? 'Saving…' : `Save and tell ${firstName}`}
        </button>
        <button type="button" className={`${ov.btn} ${ov.btnGhost}`} disabled={!dirty || st.saving} onClick={() => edit(fromPlan(plan))}>
          Cancel
        </button>
        {st.msg && <p className={st.ok ? s.ok : s.err} role={st.ok ? 'status' : 'alert'}>{st.msg}</p>}
      </div>
    </div>
  );
}
