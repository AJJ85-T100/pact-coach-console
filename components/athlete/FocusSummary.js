/**
 * Overview card: the athlete's phase and this month's focus, read-only.
 * plan: the engine's GET /v1/coach/athletes/:id/plan, or null (engine unreachable).
 * Editing lives at the top of the Settings tab (FocusPhase).
 */
import Link from 'next/link';
import s from './overview.module.css';

const PHASE = { cut: 'Cut', bulk: 'Bulk', maintain: 'Maintain', recomp: 'Recomp' };

const fmtDay = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function phaseLine(plan) {
  const name = PHASE[plan.phase];
  if (!name) return 'Not set';
  const p = plan.targetPace;
  if (p == null || plan.phase === 'recomp') return name;
  if (plan.phase === 'maintain') return `${name}, ±${Math.abs(p)} kg`;
  return `${name}, ${p > 0 ? '+' : '−'}${Math.abs(p)} kg a week`;
}

export default function FocusSummary({ plan, href }) {
  return (
    <section className={s.card} aria-labelledby="ov-focus" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex justify-between items-baseline gap-2">
        <h2 id="ov-focus" className={s.h} style={{ fontSize: 15 }}>Focus and phase</h2>
        <Link href={href} className={s.link}>Change</Link>
      </div>
      {plan ? (
        <dl className="m-0 grid gap-x-4 gap-y-2 text-[14px] text-blue" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <dt className="text-[#5B6B7F]">Phase</dt>
          <dd className="m-0">{phaseLine(plan)}</dd>
          <dt className="text-[#5B6B7F]">Focus</dt>
          <dd className="m-0" style={{ overflowWrap: 'anywhere' }}>
            {plan.focus ? (
              <>
                {plan.focus.label}
                <span className="block text-[13px] text-[#5B6B7F]">
                  Week {plan.focus.weekNumber} of {plan.focus.weeks}, started {fmtDay(plan.focus.startedOn)}
                </span>
              </>
            ) : 'Not set'}
          </dd>
        </dl>
      ) : (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Couldn’t load this just now. It’s in Settings.</p>
      )}
    </section>
  );
}
