'use client';
/**
 * The roster: who needs me, why, what do I do. Cards on any screen (phone
 * first: PTs check between sessions), a compact list for bigger rosters.
 * Data: engine GET /v1/coach/roster-cards (status + reason already worked
 * out there, most urgent first). Design: Claude Design canvas
 * "PACT Coach Roster — Redesign", version 2.
 *
 * Colour only ever means status. Week squares and weight are navy/grey, and
 * weight is green only when it moves the way the athlete's phase wants.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';

const ST = {
  need: { label: 'Needs you', color: '#D92D20', bg: '#D92D20', fg: '#FFFFFF' },
  drift: { label: 'Drifting', color: '#D9A400', bg: '#FEF7E0', fg: '#8A5A00' },
  ok: { label: 'On track', color: '#12805C', bg: '#E7F6EF', fg: '#0B5E43' },
  new: { label: 'Not started', color: '#8A98A6', bg: '#EEF2F6', fg: '#4A5A6A' },
};
const FILTERS = [['all', 'All', '#0A2540'], ['need', 'Needs you', ST.need.color], ['drift', 'Drifting', ST.drift.color], ['ok', 'On track', ST.ok.color], ['new', 'Not started', ST.new.color]];
const SQ = {
  kept: { background: '#0A2540' },
  missed: { background: '#FFFFFF', border: '1.5px dashed #8A98A6' },
  open: { background: '#DCE2EA' },
};
const PHASE = { cut: 'Cut', bulk: 'Bulk', maintain: 'Maintain', recomp: 'Recomp' };

const chip = (on) => ({
  flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px',
  border: `1px solid ${on ? '#0A2540' : '#DCE2EA'}`, background: on ? '#0A2540' : '#FFFFFF', color: on ? '#FFFFFF' : '#0A2540',
  font: '600 14px Inter, sans-serif', cursor: 'pointer',
});
const btn = (kind) => ({
  flex: 1, minHeight: 44, padding: '0 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  font: '600 14px Inter, sans-serif', textDecoration: 'none',
  border: `1px solid ${kind === 'red' ? '#D92D20' : '#0A2540'}`, background: kind === 'red' ? '#D92D20' : kind === 'blue' ? '#0A2540' : '#FFFFFF',
  color: kind === 'red' || kind === 'blue' ? '#FFFFFF' : '#0A2540',
});

function lastActiveLabel(d, today) {
  if (!d) return 'Never active';
  const n = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);
  return n <= 0 ? 'Active today' : n === 1 ? 'Active yesterday' : `Last active ${n} days ago`;
}

function Spark({ points, good, width = 104, height = 32 }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points) - 0.3;
  const max = Math.max(...points) + 0.3;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${(3 + (i * (width - 6)) / (points.length - 1)).toFixed(1)} ${(height - 3 - ((v - min) / (max - min)) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={good ? '#12805C' : '#0A2540'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Start vs latest check-in photo, same pose, side by side. Signed URLs from the engine, coach-only. */
function Photos({ photos, name }) {
  if (!photos?.start) return null;
  const first = name.split(' ')[0];
  const frame = (p, cap, empty) => (
    <figure style={{ margin: 0, flex: 1, minWidth: 0, height: 132, position: 'relative', background: '#EEF2F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {p ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.url} alt={`${first}, ${cap}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span style={{ font: '600 12px Inter, sans-serif', color: '#5B6B7F', padding: 10, textAlign: 'center' }}>{empty}</span>
      )}
      <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px', font: '600 11px Inter, sans-serif', color: '#FFFFFF', background: 'rgba(10,37,64,.75)' }}>{cap}</figcaption>
    </figure>
  );
  return (
    <div style={{ padding: '12px 14px 0', display: 'flex', gap: 6 }}>
      {frame(photos.start, `Start · ${shortDate(photos.start.date)}`)}
      {frame(photos.latest, photos.latest ? `Latest · ${shortDate(photos.latest.date)}` : 'Latest', 'Next check-in photo goes here')}
    </div>
  );
}

function Squares({ week, size = 14 }) {
  if (!week?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 3 }} aria-hidden="true">
      {week.map((s, i) => <span key={i} style={{ flex: size ? 1 : 'none', height: size, minWidth: 10, boxSizing: 'border-box', ...SQ[s] }} />)}
    </div>
  );
}

function primaryAction(a) {
  if (a.status === 'need') return { text: `Message ${a.name.split(' ')[0]}`, href: `/dashboard/clients/${a.clientId}?tab=conversation`, kind: 'red' };
  if (a.flags.some((f) => f.kind === 'consent')) return { text: 'Send consent link', href: '/dashboard', kind: 'blue' };
  if (a.status === 'new') return { text: 'Nudge them', href: `/dashboard/clients/${a.clientId}?tab=conversation`, kind: 'blue' };
  if (a.flags.some((f) => f.kind === 'focus_end')) return { text: 'Pick next focus', href: `/dashboard/clients/${a.clientId}?tab=settings`, kind: 'blue' };
  return { text: `Message ${a.name.split(' ')[0]}`, href: `/dashboard/clients/${a.clientId}?tab=conversation`, kind: 'outline' };
}

function Card({ a, today }) {
  const s = ST[a.status];
  const act = primaryAction(a);
  const w = a.weight;
  return (
    <article style={{ background: '#FFFFFF', border: '1px solid #DCE2EA', borderTop: `5px solid ${s.color}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 14px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div aria-hidden="true" style={{ width: 48, height: 48, flex: 'none', background: '#EEF2F6', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 16px Montserrat, sans-serif', color: '#0A2540' }}>{a.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ margin: 0, font: '700 17px Inter, sans-serif', color: '#0A2540', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</h2>
            <span style={{ font: '600 12px Inter, sans-serif', color: '#5B6B7F', whiteSpace: 'nowrap' }}>{a.phase ? PHASE[a.phase] : 'Phase not set'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
            <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 7px', font: '700 12px Inter, sans-serif', background: s.bg, color: s.fg }}>{s.label}</span>
            <span title={[a.why, ...a.more].join(' · ')} style={{ font: '600 14px Inter, sans-serif', color: '#0A2540', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.why}</span>
          </div>
        </div>
      </div>

      {a.status !== 'new' && <Photos photos={a.photos} name={a.name} />}

      {a.status !== 'new' && (a.week.length > 0 || w) && (
        <div style={{ padding: '14px 14px 0', display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Squares week={a.week} />
            <div style={{ font: '600 12px Inter, sans-serif', color: '#5B6B7F', marginTop: 6 }}>{a.weekNote || 'No targets logged this week'}</div>
          </div>
          {w && (
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <Spark points={w.points} good={w.good} />
              <div style={{ font: '700 12px Inter, sans-serif', color: w.good ? '#0B5E43' : '#0A2540', marginTop: 2 }}>{w.trend || w.sinceStart || ''}</div>
            </div>
          )}
        </div>
      )}

      {a.focus && (
        <div style={{ padding: '10px 14px 0', font: '600 13px Inter, sans-serif', color: '#0A2540' }}>
          Focus: {a.focus.label} <span style={{ color: '#5B6B7F', fontWeight: 500 }}>· {a.focus.hit} of {a.focus.goal} · week {a.focus.weekNumber} of {a.focus.weeks}</span>
        </div>
      )}

      {a.flags.length > 0 && (
        <div style={{ margin: '12px 14px 0', padding: '8px 10px', background: '#F4F6F9', font: '600 13px Inter, sans-serif', color: '#0A2540' }}>{a.flags[0].text}</div>
      )}

      <div style={{ padding: '12px 14px 0', display: 'flex', flexWrap: 'wrap', gap: '2px 12px', font: '500 12px Inter, sans-serif', color: '#5B6B7F', marginTop: 'auto' }}>
        <span>{lastActiveLabel(a.lastActive, today)}</span>
        {a.status !== 'new' && <span>{a.checkin === 'sent' ? 'Check-in sent' : 'Check-in due Sun'}</span>}
        {a.weeksRunning >= 2 && <span style={{ color: '#0A2540', fontWeight: 600 }}>{a.weeksRunning} weeks running</span>}
      </div>

      <div style={{ padding: 14, display: 'flex', gap: 8 }}>
        <Link href={act.href} style={btn(act.kind)}>{act.text}</Link>
        <Link href={`/dashboard/clients/${a.clientId}`} style={btn('outline')}>Open</Link>
      </div>
    </article>
  );
}

function ListView({ cards, today }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #DCE2EA', background: '#FFFFFF' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
        <thead>
          <tr>
            {['Athlete', 'Status and why', 'Phase · focus', 'This week', 'Weight', 'Last active', 'Check-in', ''].map((h) => (
              <th key={h} scope="col" style={{ font: '700 11px Inter, sans-serif', letterSpacing: '.1em', textTransform: 'uppercase', color: '#5B6B7F', textAlign: 'left', padding: '12px', borderBottom: '1px solid #DCE2EA', whiteSpace: 'nowrap' }}>{h || <span className="sr-only">Actions</span>}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((a) => {
            const s = ST[a.status];
            const act = primaryAction(a);
            return (
              <tr key={a.clientId} style={{ borderBottom: '1px solid #EEF2F6' }}>
                <td style={{ padding: 12, borderLeft: `4px solid ${s.color}`, font: '700 14px Inter, sans-serif', color: '#0A2540', whiteSpace: 'nowrap' }}>
                  <Link href={`/dashboard/clients/${a.clientId}`} style={{ color: '#0A2540', textDecoration: 'none' }}>{a.name}</Link>
                </td>
                <td style={{ padding: 12, maxWidth: 320 }}>
                  <span style={{ font: '800 11px Inter, sans-serif', letterSpacing: '.08em', textTransform: 'uppercase', color: a.status === 'need' ? '#B42318' : s.fg }}>{s.label}</span>
                  <div style={{ font: '500 13px Inter, sans-serif', color: '#0A2540', marginTop: 2 }}>{[a.why, ...a.more].join(' · ')}</div>
                </td>
                <td style={{ padding: 12, font: '500 13px Inter, sans-serif', color: '#0A2540' }}>
                  <div style={{ fontWeight: 600 }}>{a.phase ? PHASE[a.phase] : '—'}</div>
                  <div style={{ color: '#5B6B7F' }}>{a.focus ? `${a.focus.label} · wk ${a.focus.weekNumber}/${a.focus.weeks}` : 'No focus set'}</div>
                </td>
                <td style={{ padding: 12, minWidth: 150 }}>
                  <Squares week={a.week} size={12} />
                  <div style={{ font: '600 12px Inter, sans-serif', color: '#5B6B7F', marginTop: 4 }}>{a.weekNote || '—'}</div>
                </td>
                <td style={{ padding: 12, font: '600 13px Inter, sans-serif', color: a.weight?.good ? '#0B5E43' : '#0A2540', whiteSpace: 'nowrap' }}>{a.weight?.trend || a.weight?.sinceStart || '—'}</td>
                <td style={{ padding: 12, font: '500 13px Inter, sans-serif', color: '#5B6B7F', whiteSpace: 'nowrap' }}>{lastActiveLabel(a.lastActive, today)}</td>
                <td style={{ padding: 12, font: '500 13px Inter, sans-serif', color: '#5B6B7F', whiteSpace: 'nowrap' }}>{a.status === 'new' ? '—' : a.checkin === 'sent' ? 'Sent' : 'Due Sun'}</td>
                <td style={{ padding: 12, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Link href={act.href} style={{ ...btn(act.kind), minHeight: 36, fontSize: 13, flex: 'none' }}>{act.text}</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RosterBoard({ cards, today }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('cards');

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, k === 'all' ? cards.length : cards.filter((c) => c.status === k).length])), [cards]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => (filter === 'all' || c.status === filter) && (!q || c.name.toLowerCase().includes(q)));
  }, [cards, filter, query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2 }}>
          {FILTERS.map(([k, label, color]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={chip(filter === k)}>
              <span aria-hidden="true" style={{ width: 10, height: 10, background: color }} />
              {label}
              <span style={{ font: '700 12px Inter, sans-serif', minWidth: 22, height: 22, padding: '0 6px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: filter === k ? '#FFFFFF' : k === 'need' && counts[k] ? '#D92D20' : '#EEF2F6', color: filter === k ? '#0A2540' : k === 'need' && counts[k] ? '#FFFFFF' : '#0A2540' }}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="roster-q" className="sr-only">Search athletes</label>
          <input id="roster-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search athletes" style={{ height: 44, width: 200, border: '1px solid #DCE2EA', padding: '0 12px', font: '400 14px Inter, sans-serif', color: '#0A2540', background: '#FFFFFF' }} />
          <div role="group" aria-label="View" style={{ display: 'flex' }}>
            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} style={chip(view === 'cards')}>Cards</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} style={{ ...chip(view === 'list'), borderLeft: 0 }}>List</button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p style={{ margin: 0, padding: 24, background: '#FFFFFF', border: '1px solid #DCE2EA', font: '500 14px Inter, sans-serif', color: '#5B6B7F' }}>
          {filter === 'need' ? 'Nobody needs you right now.' : 'No athletes match.'}
        </p>
      ) : view === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {shown.map((a) => <Card key={a.clientId} a={a} today={today} />)}
        </div>
      ) : (
        <ListView cards={shown} today={today} />
      )}

      <p style={{ margin: 0, font: '500 13px Inter, sans-serif', color: '#5B6B7F' }}>
        Photos: the start and the latest check-in, same pose, side by side. Squares: this week, all targets together. Navy kept, dashed missed, pale not yet or no data.
      </p>
    </div>
  );
}
