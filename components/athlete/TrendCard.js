'use client';

/**
 * Trend — adherence, days silent and streak from athlete_state_daily, plus
 * weekly session adherence for the last 8 weeks. Columns build on load and
 * rebuild on hover; the latest week is red; hover a column for its value.
 *
 * stats: from lib/athlete/overview trendStats() (or null)
 * weeks: [{ label, v }] oldest → newest; v null = nothing planned that week
 */
import s from './overview.module.css';

const BLUE = '#0A2540';
const RED = '#D92D20';

function Num({ label, value, sub, subColor = '#5B6B7F', delay }) {
  return (
    <div className={s.num} style={{ animationDelay: `${delay}s` }}>
      <p className={s.lbl}>{label}</p>
      <p className={s.h} style={{ fontSize: 26, marginTop: 4 }}>{value ?? '—'}</p>
      {sub && <p style={{ margin: 0, fontSize: 12, color: subColor }}>{sub}</p>}
    </div>
  );
}

export default function TrendCard({ stats, weeks = [] }) {
  const withData = weeks.filter((w) => w.v != null);
  const first = withData[0];
  const last = withData[withData.length - 1];
  const aria = withData.length
    ? `Weekly adherence over the last 8 weeks, from ${first.v}% in the week of ${first.label} to ${last.v}% in the week of ${last.label}`
    : 'No weekly adherence data yet';

  return (
    <section className={s.card} aria-labelledby="ov-trend" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="ov-trend" className={s.h} style={{ fontSize: 15 }}>Trend</h2>
        {stats?.asOf && <p className={s.lbl}>As of {stats.asOf}</p>}
      </div>

      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <Num label="Adherence" value={stats.adherence == null ? null : `${stats.adherence}%`} sub={stats.adherenceSub} subColor={stats.adherenceDown ? '#B42318' : '#5B6B7F'} delay={0.1} />
          <Num label="Days silent" value={stats.daysSilent} sub={stats.silentSub} delay={0.2} />
          <Num label="Streak" value={stats.streak} sub={stats.streakSub} delay={0.3} />
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: '#5B6B7F', lineHeight: 1.5 }}>
          PAX hasn’t built a daily snapshot for this athlete yet. It runs each night once they’re on the engine.
        </p>
      )}

      <div style={{ borderTop: '1px solid #EEF1F5', paddingTop: 12 }}>
        <p className={s.lbl}>Weekly adherence, last 8 weeks</p>
        {withData.length === 0 ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5B6B7F' }}>No planned sessions in the last 8 weeks.</p>
        ) : (
          <div className={s.tchart} role="img" aria-label={aria}>
            {weeks.map((w, i) => {
              const latest = w === last;
              return (
                <div key={w.from} className={s.tc}>
                  <span className={s.cv}>{w.v == null ? 'No plan' : `${w.v}%`}</span>
                  <div
                    className={s.tf}
                    style={{
                      height: w.v == null ? 2 : Math.max(2, Math.round(w.v * 0.72)),
                      background: w.v == null ? '#E8EDF3' : latest ? RED : BLUE,
                      animationDelay: `${300 + i * 70}ms`,
                    }}
                  />
                  <span className={s.cd}>{w.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
