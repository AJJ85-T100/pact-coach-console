/**
 * Overview card: the Cortex record for this athlete. What PAX and the coach
 * asked for in the last 4 weeks and what came back (acted / replied /
 * nothing), the last few moves, and "What works for {name}" once enough
 * messages have had their window (engine domain/whatWorks.ts: twelve
 * resolved, no line on fewer than four tries). Read-only; the open proposal
 * is acted on in "Do this next" above.
 *
 * data: the engine's GET /v1/coach/athletes/:id/moves, or null when it
 * couldn't be reached.
 */
import s from './overview.module.css';

const LEVER = { session: 'Session', protein: 'Protein', food: 'Food', steps: 'Walk', sleep: 'Sleep', weigh_in: 'Weigh-in', reply: 'Question / note', rest: 'Rest', check_in: 'Check-in', pact: 'Pact', focus: 'Focus habit', open: 'Your own', none: 'No ask' };
const RESPONSE = { acted: { text: 'did it', color: '#1B6E3A' }, replied: { text: 'replied', color: '#0A2540' }, none: { text: 'nothing back', color: '#5B6B7F' }, pending: { text: 'waiting', color: '#5B6B7F' } };
const TYPE = { morning: 'Morning', midday: 'Midday', evening: 'Evening', slip_checkin: 'Slip check-in', nudge: 'Nudge', coach_message: 'From you', move: 'Move', reply: 'Chat reply' };

const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });

export default function MovesCard({ data, firstName }) {
  const name = firstName || 'this athlete';
  const sum = data?.summary;
  const recent = (data?.recent || []).slice(0, 8);
  const ww = data?.whatWorks;
  const levers = sum ? Object.entries(sum.levers).sort((a, b) => b[1].sent - a[1].sent).slice(0, 5) : [];
  return (
    <section className={s.card} aria-labelledby="ov-moves" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <h2 id="ov-moves" className={s.h} style={{ fontSize: 15 }}>What lands for {name}</h2>
        {sum && <p className={s.lbl}>Last 4 weeks · {sum.sent} message{sum.sent === 1 ? '' : 's'}</p>}
      </div>
      {!data ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">Couldn’t load this just now.</p>
      ) : (
        <>
          {sum && sum.sent > 0 ? (
            <dl className="m-0 grid gap-x-4 gap-y-1 text-[14px] text-blue" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <dt className="text-[#5B6B7F]">Did it</dt>
              <dd className="m-0 tabular-nums">{sum.responses.acted}</dd>
              <dt className="text-[#5B6B7F]">Replied</dt>
              <dd className="m-0 tabular-nums">{sum.responses.replied}</dd>
              <dt className="text-[#5B6B7F]">Nothing back</dt>
              <dd className="m-0 tabular-nums">{sum.responses.none}{sum.responses.pending ? ` (${sum.responses.pending} still waiting)` : ''}</dd>
            </dl>
          ) : (
            <p className="m-0 text-[14px] text-[#5B6B7F]">Nothing with an ask has gone to {name} in the last 4 weeks.</p>
          )}
          {levers.length > 0 && (
            <ul aria-label="By what was asked for" className="m-0 p-0 list-none flex flex-col gap-1 text-[13px] text-blue">
              {levers.map(([lever, t]) => (
                <li key={lever} className="flex justify-between gap-3">
                  <span>{LEVER[lever] || lever} asks</span>
                  <span className="tabular-nums text-[#5B6B7F]">{t.acted + (lever === 'reply' ? t.replied : 0)} of {t.sent} landed</span>
                </li>
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <div>
              <p className={s.lbl} style={{ marginBottom: 6 }}>Recent</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13px]">
                {recent.map((r) => {
                  const resp = RESPONSE[r.response] || RESPONSE.pending;
                  return (
                    <li key={r.id} className="flex justify-between gap-3 text-blue" style={{ overflowWrap: 'anywhere' }}>
                      <span><span className="text-[#5B6B7F]">{when(r.at)}</span> · {r.label || `${TYPE[r.type] || r.type}: ${LEVER[r.lever] || r.lever}`}</span>
                      <span style={{ color: resp.color, fontWeight: r.response === 'acted' ? 600 : 400, whiteSpace: 'nowrap' }}>{resp.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 10 }}>
            <p className={s.lbl} style={{ marginBottom: 6 }}>What works for {name}</p>
            {ww?.ready ? (
              <ul className="m-0 pl-[18px] text-[14px] text-blue" style={{ lineHeight: 1.5 }}>
                {ww.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            ) : (
              <p className="m-0 text-[13px] text-[#5B6B7F]">
                {ww ? `After ${ww.needed} more message${ww.needed === 1 ? '' : 's'} have had their window to be answered. ${name} sees the same card on Progress, in your name.` : 'Not available just now.'}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
