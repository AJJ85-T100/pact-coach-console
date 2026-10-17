'use client';

/**
 * This week vs targets — one bar per target that has real data and a real
 * target. Bars grow in on load and refill on hover/focus; hover/focus opens
 * a Mon–Sun column chart for that target, columns rising in turn, with the
 * day's value on column hover. Motion is off under prefers-reduced-motion
 * (see overview.module.css).
 *
 * rows: [{ key, name, value, of, pct, color, note, days: [{ label, v, h, c }] }]
 */
import s from './overview.module.css';

const RED = '#D92D20';

export default function TargetBars({ rows = [], footnote, editHref }) {
  return (
    <section className={s.card} aria-labelledby="ov-targets" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="ov-targets" className={s.h} style={{ fontSize: 15 }}>This week vs targets</h2>
        {editHref && <a href={editHref} className={s.link}>Edit targets</a>}
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#5B6B7F', lineHeight: 1.5 }}>
          Nothing to measure yet this week. Rows appear once there’s a plan or a target and something logged against it.
        </p>
      ) : (
        rows.map((t) => (
          <div key={t.key} className={s.row} tabIndex={0} aria-label={`${t.name}: ${t.value} ${t.of}. ${t.note || ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, color: '#0A2540' }}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span>
                <strong style={{ color: t.color === RED ? '#B42318' : '#0A2540' }}>{t.value}</strong> {t.of}
              </span>
            </div>
            <div className={s.bar}>
              <div className={s.fill} style={{ width: `${Math.max(0, Math.min(100, t.pct))}%`, background: t.color }} />
            </div>
            {t.note && <p className={s.note}>{t.note}</p>}
            <div className={s.days} aria-hidden="true">
              {t.days.map((d, i) => (
                <div key={d.label} className={s.col}>
                  <span className={s.cv}>{d.v}</span>
                  <div className={s.cb}>
                    <div className={s.cf} style={{ height: `${d.h}%`, background: d.c, animationDelay: `${i * 55}ms` }} />
                  </div>
                  <span className={s.cd}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {footnote && <p style={{ margin: 0, fontSize: 12, color: '#5B6B7F' }}>{footnote}</p>}
    </section>
  );
}
