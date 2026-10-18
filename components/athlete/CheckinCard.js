/**
 * Weekly check-in — what the athlete sent from the app ("Your week, for Will"):
 * the engine's prefilled facts plus their answers. Newest first; the latest is
 * open, older weeks are one line each. Athlete words are shown as written.
 *
 * checkins: [{ weekStart, sentAt, energy, hunger, win, blocker, summary }]
 */
import s from './overview.module.css';

const ENERGY = { 1: 'Low', 2: 'OK', 3: 'Good' };
const HUNGER = { 1: 'Low', 2: 'OK', 3: 'High' };

const weekLabel = (iso) =>
  `Week of ${new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;

function facts(summary = {}) {
  const out = [];
  if (summary.weight) {
    const d = summary.weight.deltaVsLastWeek;
    out.push(['Avg weight', `${summary.weight.avg} kg${d != null ? ` (${d > 0 ? '+' : ''}${d} vs last week)` : ''}`]);
  }
  if (summary.sessions) out.push(['Sessions', `${summary.sessions.done} of ${summary.sessions.planned}`]);
  if (summary.protein) out.push(['Protein target', `${summary.protein.hitDays} of ${summary.protein.days} days`]);
  if (summary.steps) out.push(['Steps, daily avg', summary.steps.avg.toLocaleString('en-GB')]);
  for (const p of summary.pacts || []) out.push([p.name, `${p.kept} of ${p.of}`]);
  return out;
}

export default function CheckinCard({ checkins, firstName }) {
  if (!checkins) return null;
  const [latest, ...older] = checkins;
  return (
    <section className={s.card} aria-labelledby="ov-checkin" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex justify-between items-baseline gap-2 flex-wrap">
        <h2 id="ov-checkin" className={s.h} style={{ fontSize: 15 }}>Weekly check-in</h2>
        {latest && <p className={s.lbl}>{weekLabel(latest.weekStart)}</p>}
      </div>

      {!latest ? (
        <p className="m-0 text-[14px] text-[#5B6B7F]">
          No check-in yet. {firstName} gets a prefilled one in the app each week and it lands here when they send it.
        </p>
      ) : (
        <>
          <dl className="m-0 grid gap-x-4 gap-y-2 text-[14px] text-blue" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <dt className="text-[#5B6B7F]">Energy</dt>
            <dd className="m-0">{ENERGY[latest.energy] || '—'}</dd>
            <dt className="text-[#5B6B7F]">Hunger</dt>
            <dd className="m-0">{HUNGER[latest.hunger] || '—'}</dd>
            {facts(latest.summary).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt className="text-[#5B6B7F]">{k}</dt>
                <dd className="m-0 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {latest.win && (
            <div>
              <p className={s.lbl}>Best thing this week</p>
              <p className="m-0 mt-1 text-[14px] text-blue" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{latest.win}</p>
            </div>
          )}
          {latest.blocker && (
            <div>
              <p className={s.lbl}>Getting in the way</p>
              <p className="m-0 mt-1 text-[14px] text-blue" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{latest.blocker}</p>
            </div>
          )}
          <p className="m-0 text-[12px] text-[#5B6B7F]">
            Sent {new Date(latest.sentAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}. Reply from the Conversation tab.
          </p>
        </>
      )}

      {older.length > 0 && (
        <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 10 }}>
          {older.map((c) => (
            <p key={c.weekStart} className="m-0 text-[13px] text-[#5B6B7F]" style={{ padding: '4px 0' }}>
              {weekLabel(c.weekStart)} · energy {String(ENERGY[c.energy] || '—').toLowerCase()}, hunger {String(HUNGER[c.hunger] || '—').toLowerCase()}
              {c.summary?.weight ? ` · ${c.summary.weight.avg} kg` : ''}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
