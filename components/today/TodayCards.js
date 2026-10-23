/**
 * Today — presentational cards. No state, CSS-only motion (today.module.css),
 * so they render on the server. Every figure arrives already derived from
 * real rows (lib/today/derive.js); a card with nothing real to show says so
 * or isn't rendered.
 */
import Link from 'next/link';
import s from './today.module.css';

const BLUE = '#0A2540';
const RED = '#D92D20';
const AMBER = '#E07A00';
const SLATE = '#5B7FA6';

const gbp = (v) => `£${Math.round(v).toLocaleString('en-GB')}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// ------------------------------------------------------------
// Stacked bar (Roster today, PAX today)
// ------------------------------------------------------------
function Stack({ segs, label }) {
  const shown = segs.filter((x) => x.n > 0);
  if (!shown.length) return null;
  return (
    <>
      <div className={s.stack} role="img" aria-label={label} tabIndex={0} style={{ margin: '36px 0 12px' }}>
        {shown.map((x, i) => (
          <div key={x.key} className={s.seg} style={{ flex: `${x.n} 1 0`, background: x.color, animationDelay: `${0.1 + i * 0.15}s` }}>
            {x.n}
            <span className={s.segtip}>{x.tip}</span>
          </div>
        ))}
      </div>
      <div className={s.legend}>
        {segs.map((x) => (
          <span key={x.key}><span className={s.sw} style={{ background: x.color }} />{x.name}</span>
        ))}
      </div>
    </>
  );
}

export function RosterToday({ bands }) {
  const { total } = bands;
  // Engine roster status (same as the Athletes page) when it answered;
  // the older slip-risk bands only as a fallback.
  const fromCards = bands.need != null;
  const segs = fromCards
    ? [
        { key: 'need', name: 'Needs you', n: bands.need, color: RED, tip: `${bands.need} need you` },
        { key: 'drift', name: 'Drifting', n: bands.drifting, color: AMBER, tip: `${bands.drifting} drifting` },
        { key: 'on', name: 'On track', n: bands.on_track, color: BLUE, tip: `${bands.on_track} on track` },
        { key: 'new', name: 'Not started', n: bands.not_started, color: SLATE, tip: `${bands.not_started} not started` },
      ]
    : [
        { key: 'on', name: 'On track', n: bands.on_track, color: BLUE, tip: `${bands.on_track} on track` },
        { key: 'watch', name: 'Watch', n: bands.watch, color: AMBER, tip: `${bands.watch} to watch` },
        { key: 'drift', name: 'Drifting', n: bands.drifting, color: RED, tip: `${bands.drifting} drifting` },
      ];
  const label = segs.filter((x) => x.n > 0).map((x) => `${x.n} ${x.name.toLowerCase()}`).join(', ');
  return (
    <section className={s.card} aria-labelledby="t-roster">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="t-roster" className={s.h2}>Roster today</h2>
        <Link href="/dashboard/athletes" style={{ fontSize: 13, fontWeight: 600 }}>Athletes →</Link>
      </div>
      <p className={s.big}>{total} <span className={s.unit}>athlete{total === 1 ? '' : 's'}</span></p>
      {total > 0 && (fromCards || bands.hasState) ? (
        <Stack label={label} segs={segs} />
      ) : (
        <p className={s.why} style={{ marginTop: 10 }}>{total ? 'Statuses appear once PACT has a day of data for your athletes.' : 'Invite your first athlete to see them here.'}</p>
      )}
    </section>
  );
}

export function PaxToday({ sentOwn, drafted, escalated }) {
  const total = sentOwn + drafted + escalated;
  return (
    <section className={s.card} aria-labelledby="t-pax">
      <h2 id="t-pax" className={s.h2}>PAX today</h2>
      {total === 0 ? (
        <p className={s.why} style={{ marginTop: 10 }}>Nothing sent, drafted or escalated yet today.</p>
      ) : (
        <Stack
          label={`${sentOwn} sent on its own, ${drafted} drafted for you, ${escalated} escalated`}
          segs={[
            { key: 'own', name: 'Sent on its own', n: sentOwn, color: BLUE, tip: `${sentOwn} sent on its own` },
            { key: 'draft', name: 'Drafted', n: drafted, color: SLATE, tip: `${drafted} drafted for you` },
            { key: 'esc', name: 'Escalated', n: escalated, color: RED, tip: `${escalated} escalated` },
          ]}
        />
      )}
    </section>
  );
}

export function AthletesReplying({ reply }) {
  const { days, overall, n } = reply;
  const last = days[days.length - 1];
  return (
    <section className={s.card} aria-labelledby="t-reply">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="t-reply" className={s.h2}>Athletes replying</h2>
        <a href="#whats-working" style={{ fontSize: 13, fontWeight: 600 }}>What’s working →</a>
      </div>
      <p className={s.why}>Share of PAX messages answered within 4 hours, last 7 days</p>
      {n === 0 ? (
        <p className={s.why} style={{ marginTop: 10 }}>No messages old enough to measure yet. Each one is checked 4 hours after it’s sent.</p>
      ) : (
        <>
          <p className={s.big}>{overall}% <span className={s.unit}>of {n} message{n === 1 ? '' : 's'}</span></p>
          <div className={s.cols} role="img" aria-label={`Reply rate by day over the last 7 days${last.v != null ? `, ${last.v}% today` : ''}`}>
            {days.map((d, i) => (
              <div key={d.key} className={s.c}>
                <span className={s.cv}>{d.v == null ? 'None' : `${d.v}% · ${d.n}`}</span>
                <div
                  className={s.cf}
                  style={{
                    height: d.v == null ? 2 : Math.max(3, Math.round(d.v * 0.8)),
                    background: d.v == null ? '#E8EDF3' : i === days.length - 1 ? RED : BLUE,
                    animationDelay: `${200 + i * 70}ms`,
                  }}
                />
                <span className={s.cd}>{d.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Revenue strip
// ------------------------------------------------------------
const PROMPT = 'Add fees, renewal dates and your baseline churn to see what PACT keeps';

export function RevenueStrip({ rev }) {
  const { columns, atRisk, kept, keptMissing } = rev;

  // Columns not there yet (migration not run) or no fees entered: just the prompt.
  if (!columns.monthly_fee || !atRisk || !atRisk.anyFees) {
    return (
      <section className={s.card} aria-label="Revenue" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className={s.lbl}>Revenue</p>
          <p style={{ margin: '6px 0 0', fontSize: 15 }}>{PROMPT}.</p>
        </div>
        <Link className={s.btn} href="/dashboard/settings#business">Set up</Link>
      </section>
    );
  }

  const r = atRisk;
  let riskLine;
  let riskSub = null;
  if (r.driftingCount === 0) {
    riskLine = 'Revenue at risk: £0/month';
    riskSub = 'No drifting athletes right now.';
  } else if (r.anyRenewalDates) {
    riskLine = `Revenue at risk: ${gbp(r.renewingAmount)}/month`;
    riskSub = r.renewingCount
      ? `${plural(r.renewingCount, 'drifting athlete')} renew${r.renewingCount === 1 ? 's' : ''} in the next 14 days${r.renewingNoFee ? ` (${r.renewingNoFee} without a fee set)` : ''}.`
      : `None of your ${plural(r.driftingCount, 'drifting athlete')} renew in the next 14 days.`;
  } else {
    riskLine = `Revenue at risk: ${gbp(r.driftingAmount)}/month`;
    riskSub = `${plural(r.driftingCount, 'drifting athlete')}${r.driftingNoFee ? ` (${r.driftingNoFee} without a fee set)` : ''}. Add renewal dates to see who renews soon.`;
  }

  let keptCell;
  if (kept) {
    const good = kept.amount >= 0;
    keptCell = (
      <>
        <p className={s.lbl}>Kept this month vs your baseline · estimate</p>
        <p className={s.revBig} style={{ color: good ? BLUE : '#B42318' }}>
          {good ? `${gbp(kept.amount)}/month kept` : `${gbp(-kept.amount)}/month below baseline`}
        </p>
        <p className={s.why}>
          {kept.left} of {kept.atStart} left this month ({kept.actualPct.toFixed(1)}%) vs your usual {kept.baselinePct}%, at an average {gbp(kept.avgFee)}.
        </p>
      </>
    );
  } else {
    const need = keptMissing.includes('baseline')
      ? 'Add your usual monthly churn in Settings to see what PACT keeps.'
      : keptMissing.includes('churn_date')
        ? 'Needs the date each athlete left, which isn’t recorded yet.'
        : keptMissing.includes('fees')
          ? 'Add monthly fees on each athlete’s Settings tab.'
          : 'Not enough athletes with fees at the start of the month to estimate yet.';
    keptCell = (
      <>
        <p className={s.lbl}>Kept this month vs your baseline</p>
        <p style={{ margin: 0, fontSize: 14 }}>{need}</p>
        {keptMissing.includes('baseline') && <Link href="/dashboard/settings#business" style={{ fontSize: 13, fontWeight: 600 }}>Settings →</Link>}
      </>
    );
  }

  return (
    <section className={`${s.card} ${s.revenue}`} aria-label="Revenue">
      <div className={s.revCell}>
        <p className={s.lbl} style={{ color: r.renewingCount ? '#D92D20' : undefined }}>At risk</p>
        <p className={s.revBig}>{riskLine}</p>
        {riskSub && <p className={s.why}>{riskSub}</p>}
        {r.names.length > 0 && (
          <p className={s.why}>
            {r.names.map((n, i) => (
              <span key={n.clientId}>{i > 0 && ' · '}<Link href={`/dashboard/clients/${n.clientId}`}>{n.athlete}</Link>{n.fee != null ? ` ${gbp(n.fee)}` : ''}, {new Date(`${n.renews}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
            ))}
          </p>
        )}
      </div>
      <div className={s.revCell} style={{ animationDelay: '.1s' }}>{keptCell}</div>
    </section>
  );
}

// ------------------------------------------------------------
// Onboarding funnel
// ------------------------------------------------------------
export function OnboardingFunnel({ funnel }) {
  const top = funnel.stages[0].count;
  if (!top) return null;
  const stuckTotal = funnel.stages.reduce((n, st) => n + st.stuck.length, 0);
  return (
    <section className={s.card} aria-labelledby="t-funnel" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h2 id="t-funnel" className={s.h2}>Getting started{stuckTotal > 0 && <span className={s.count}>{stuckTotal} stuck</span>}</h2>
        <Link href="/dashboard/invite" style={{ fontSize: 13, fontWeight: 600 }}>Invite athlete →</Link>
      </div>
      <p className={s.why} style={{ marginBottom: 6 }}>From invite to first log. Hover or tab to a step to see who’s stuck before it.</p>
      {funnel.stages.map((st, i) => {
        const w = Math.max(st.count ? 6 : 0, pct(st.count, top));
        return (
          <div key={st.key} className={s.fRow} tabIndex={0} aria-label={`${st.label}: ${st.count} of ${top}.${st.stuck.length ? ` ${st.stuck.length} stuck: ${st.stuck.map((p) => p.athlete).join(', ')}` : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{st.label}</span>
              <span><strong>{st.count}</strong>{i > 0 && <span style={{ color: '#5B6B7F' }}> of {top}</span>}</span>
            </div>
            <div className={s.fTrack}>
              <div className={s.fFill} style={{ width: `${w}%`, background: i === funnel.stages.length - 1 ? RED : BLUE, animationDelay: `${0.15 + i * 0.15}s` }}>
                <span className={s.fVal}>{pct(st.count, top)}%</span>
              </div>
            </div>
            {st.stuck.length > 0 && (
              <p className={s.why}>
                <span style={{ color: '#B54708', fontWeight: 600 }}>{st.stuckWhy}:</span>{' '}
                {st.stuck.slice(0, 8).map((p, j) => (
                  <span key={`${p.clientId || 'inv'}-${j}`}>
                    {j > 0 && ', '}
                    {p.clientId ? <Link href={`/dashboard/clients/${p.clientId}`}>{p.athlete}</Link> : p.athlete}
                  </span>
                ))}
                {st.stuck.length > 8 && ` and ${st.stuck.length - 8} more`}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
