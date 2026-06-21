'use client';

import { useEffect, useRef, useState } from 'react';

const STATUS = {
  strong: { label: 'Strong', color: '#0F8A5F', fill: true },
  on_track: { label: 'On track', color: '#0A2540', fill: false },
  watch: { label: 'Watch', color: '#D97706', fill: true },
  at_risk: { label: 'At risk', color: '#D92D20', fill: true },
};
const statusOf = (k) => STATUS[String(k || '').toLowerCase()] || STATUS.on_track;

const MOMENTUM = {
  building: { label: 'Building', color: '#0F8A5F', bg: '#E7F4EF' },
  steady: { label: 'Steady', color: '#0A2540', bg: '#EBF1F5' },
  slipping: { label: 'Slipping', color: '#D97706', bg: '#FDF1E3' },
  stalled: { label: 'Stalled', color: '#D92D20', bg: '#FBE9E7' },
};
const momentumOf = (k) => MOMENTUM[String(k || '').toLowerCase()] || MOMENTUM.steady;

export default function ReportsBoard({ clients, ptName }) {
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [roster, setRoster] = useState(null); // { summary, clients, week_ending }
  const [rosterLoading, setRosterLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(clients?.[0]?.id || null);
  const [reports, setReports] = useState({}); // `${id}:${week}` -> { loading, error, data }
  const [panelWidth, setPanelWidth] = useState(400);
  const panelWidthRef = useRef(400);
  const draggingRef = useRef(false);

  function startDrag(e) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  async function fetchRoster(week) {
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/reports/roster?weeks_ago=${week}`, { cache: 'no-store' });
      const j = await res.json();
      setRoster(j);
      if (!selectedId && j.clients?.[0]) setSelectedId(j.clients[0].id);
    } catch {
      setRoster({ summary: {}, clients: [], week_ending: null });
    } finally {
      setRosterLoading(false);
    }
  }

  async function loadReport(id, week) {
    const key = `${id}:${week}`;
    setReports((r) => ({ ...r, [key]: { loading: true } }));
    try {
      const res = await fetch(`/api/reports/${id}?weeks_ago=${week}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not generate report.');
      setReports((r) => ({ ...r, [key]: { data: j } }));
    } catch (e) {
      setReports((r) => ({ ...r, [key]: { error: e.message } }));
    }
  }

  function selectClient(id) {
    setSelectedId(id);
    const key = `${id}:${weeksAgo}`;
    if (!reports[key] || reports[key].error) loadReport(id, weeksAgo);
  }

  function changeWeek(delta) {
    const next = Math.max(0, weeksAgo + delta);
    if (next === weeksAgo) return;
    setWeeksAgo(next);
    fetchRoster(next);
    if (selectedId) {
      const key = `${selectedId}:${next}`;
      if (!reports[key]) loadReport(selectedId, next);
    }
  }

  useEffect(() => {
    fetchRoster(0);
    if (selectedId) loadReport(selectedId, 0);
    try {
      const saved = parseInt(localStorage.getItem('pax_reports_panel_w') || '', 10);
      if (saved >= 320 && saved <= 720) {
        setPanelWidth(saved);
        panelWidthRef.current = saved;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return;
      const w = Math.min(720, Math.max(320, window.innerWidth - e.clientX));
      panelWidthRef.current = w;
      setPanelWidth(w);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        localStorage.setItem('pax_reports_panel_w', String(panelWidthRef.current));
      } catch {}
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const rosterClients = roster?.clients || (clients || []).map((c) => ({ id: c.id, name: c.name, status: 'on_track', stats: {} }));
  const filtered = rosterClients.filter((c) => (c.name || '').toLowerCase().includes(search.toLowerCase()));
  const selected = rosterClients.find((c) => c.id === selectedId) || null;
  const state = selectedId ? reports[`${selectedId}:${weeksAgo}`] : null;
  const s = roster?.summary || {};

  return (
    <div className="flex h-screen">
      {/* Roster side */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-white">
        <div className="p-6 sm:p-8 max-w-4xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <div className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px] mb-1">Auto-generated · weekly</div>
              <h1 className="font-['Montserrat'] font-extrabold text-[28px] text-[#0A2540] uppercase tracking-tight leading-none">PAX reports</h1>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athletes…"
              className="font-['Inter'] text-[13px] text-[#0A2540] bg-[#F4F6F8] border border-[#E2E6EB] rounded-[8px] px-4 py-2.5 w-[240px] focus:outline-none focus:border-[#D92D20]"
            />
          </div>

          {/* Week nav */}
          <div className="flex items-center justify-center gap-4 my-5 py-3 border-y border-[#E2E6EB]">
            <button onClick={() => changeWeek(1)} className="w-9 h-9 grid place-items-center rounded-[6px] border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] transition-colors">←</button>
            <div className="text-center">
              <div className="font-['Montserrat'] font-bold text-[15px] text-[#0A2540]">
                {weeksAgo === 0 ? 'This week' : `Week ending ${fmtLong(roster?.week_ending)}`}
              </div>
              <div className="font-['Inter'] text-[12px] text-[#8A95A3]">
                {rosterLoading ? 'loading…' : `${s.total || 0} ${s.total === 1 ? 'athlete' : 'athletes'} reported`}
              </div>
            </div>
            <button onClick={() => changeWeek(-1)} disabled={weeksAgo === 0} className="w-9 h-9 grid place-items-center rounded-[6px] border border-[#E2E6EB] enabled:hover:border-[#0A2540] text-[#0A2540] disabled:opacity-30 transition-colors">→</button>
          </div>

          {/* Summary row */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 mb-6">
            <Summary n={s.strong} label="Strong" color={STATUS.strong.color} />
            <Summary n={s.on_track} label="On track" color="#0A2540" />
            <Summary n={s.watch} label="Watch" color={STATUS.watch.color} />
            <Summary n={s.at_risk} label="At risk" color={STATUS.at_risk.color} />
            <Summary n={`${s.pacts_kept ?? 0}/${s.pacts_total ?? 0}`} label="Pacts kept" />
            <Summary n={avgAdh(rosterClients)} label="Avg adherence" />
          </div>

          {/* Roster rows */}
          {rosterLoading && !roster ? (
            <p className="font-['Inter'] text-[13px] text-[#8A95A3]">Loading roster…</p>
          ) : filtered.length === 0 ? (
            <p className="font-['Inter'] text-[13px] text-[#8A95A3]">No athletes match.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => (
                <RosterRow key={c.id} client={c} selected={c.id === selectedId} onSelect={selectClient} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resizer */}
      <div
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        className="w-1.5 flex-shrink-0 cursor-col-resize bg-[#E2E6EB] hover:bg-[#D92D20] active:bg-[#D92D20] transition-colors"
      />

      {/* Detail panel */}
      <div className="flex-shrink-0 border-l border-[#E2E6EB] overflow-y-auto bg-[#F4F6F8] p-6" style={{ width: panelWidth }}>
        {!selected ? (
          <p className="font-['Inter'] text-[#8A95A3]">Select an athlete.</p>
        ) : (
          <DetailPanel client={selected} state={state} onRetry={() => loadReport(selected.id, weeksAgo)} />
        )}
      </div>
    </div>
  );
}

function Summary({ n, label, color }) {
  return (
    <div>
      <div className="font-['Montserrat'] font-extrabold text-[26px] leading-none" style={{ color: color || '#0A2540' }}>{n ?? 0}</div>
      <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A95A3] mt-1">{label}</div>
    </div>
  );
}

function RosterRow({ client, selected, onSelect }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const st = statusOf(client.status);
  const stats = client.stats || {};
  return (
    <button
      onClick={() => onSelect(client.id)}
      className={`w-full text-left flex items-center gap-4 bg-white rounded-[8px] border pl-0 pr-4 py-3 transition-colors overflow-hidden ${
        selected ? 'border-[#0A2540] border-2' : 'border-[#E2E6EB] hover:bg-[#F4F6F8]'
      }`}
    >
      <span className="self-stretch w-[4px] flex-shrink-0" style={{ background: st.color }} />
      <div className="w-10 h-10 rounded-[6px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-bold text-[13px] flex-shrink-0">{initials}</div>
      <div className="min-w-0 w-[150px] flex-shrink-0">
        <div className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] truncate">{client.name}</div>
        <div className="font-['Inter'] text-[11px] text-[#8A95A3] truncate">
          {client.program_name ? `${client.program_name}${client.program_week ? ` · Wk ${client.program_week}/${client.program_weeks || '?'}` : ''}` : (client.goal || '—')}
        </div>
      </div>
      <Metric label="Adherence" value={stats.adherencePct == null ? '—' : `${stats.adherencePct}%`} delta={stats.delta} />
      <Metric label="Pacts" value={stats.total ? `${stats.wins}/${stats.total}` : '—'} />
      <Metric label="Streak" value={stats.streak > 0 ? stats.streak : '—'} />
      <div className="ml-auto flex-shrink-0">
        <StatusPill status={client.status} />
      </div>
    </button>
  );
}

function Metric({ label, value, delta }) {
  return (
    <div className="hidden sm:block text-center w-[72px] flex-shrink-0">
      <div className="font-['Montserrat'] font-bold text-[15px] text-[#0A2540] leading-none flex items-center justify-center gap-1">
        {value}
        {delta != null && delta !== 0 && (
          <span className={`text-[11px] ${delta > 0 ? 'text-[#0F8A5F]' : 'text-[#D92D20]'}`}>{delta > 0 ? '↑' : '↓'}</span>
        )}
      </div>
      <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A95A3] mt-1.5">{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const st = statusOf(status);
  const style = st.fill
    ? { background: st.color, color: '#fff', border: `1px solid ${st.color}` }
    : { background: '#fff', color: st.color, border: `1.5px solid ${st.color}` };
  return (
    <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.1em] px-3 py-1.5 rounded-[6px] whitespace-nowrap" style={style}>
      {st.label}
    </span>
  );
}

function DetailPanel({ client, state, onRetry }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const data = state?.data;
  const report = data?.report;
  const rstats = data?.stats;
  const st = statusOf(client.status);
  const cs = client.stats || {};
  const m = report ? momentumOf(report.momentum) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[16px] flex-shrink-0">{initials}</div>
        <div className="min-w-0">
          <h2 className="font-['Montserrat'] font-extrabold text-[20px] text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[12px] text-[#8A95A3] mt-1">
            {client.goal || 'No goal set'}{client.program_week ? ` · Wk ${client.program_week} of ${client.program_weeks || '?'}` : ''}
          </div>
        </div>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-[#E2E6EB]">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: st.color }} />
        <span className="font-['Inter'] text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: st.color }}>{st.label}</span>
        {cs.adherencePct != null && (
          <span className="font-['Inter'] text-[12px] text-[#8A95A3]">· {cs.adherencePct}% adherence</span>
        )}
      </div>

      {state?.loading && (
        <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-5 text-center">
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is writing the week up…</p>
        </div>
      )}
      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn’t generate:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {report && (
        <>
          {/* Headline */}
          <div className="bg-white border border-[#E2E6EB] rounded-[10px] p-4 mb-4" style={{ borderLeft: `4px solid ${m.color}` }}>
            <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: m.color, background: m.bg, padding: '3px 8px', borderRadius: '4px' }}>{m.label}</span>
            <div className="font-['Montserrat'] font-extrabold text-[19px] leading-[1.15] text-[#0A2540] mt-2.5">{report.headline}</div>
          </div>

          {/* Stat grid */}
          {rstats && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Tile label="Adherence" value={rstats.adherence_pct == null ? '—' : `${rstats.adherence_pct}%`} tone={adhTone(rstats.adherence_pct)} delta={rstats.delta} />
              <Tile label="Pacts kept" value={`${rstats.wins}/${rstats.win_total}`} />
              <Tile label="Days tracked" value={String(rstats.days_logged)} />
              <Tile label="Best streak" value={rstats.top_streak > 0 ? String(rstats.top_streak) : '—'} />
              <Tile label="Slip days" value={String(rstats.slip_days)} tone={rstats.slip_days > 2 ? 'warn' : 'neutral'} />
              {client.current_weight != null && (
                <Tile label="Weight" value={`${client.current_weight}kg`} sub={client.target_weight ? `→ ${client.target_weight}` : null} />
              )}
            </div>
          )}

          {Array.isArray(report.what_worked) && report.what_worked.length > 0 && (
            <Block title="What worked">
              {report.what_worked.map((x, i) => (
                <div key={i} className="flex gap-2 items-start font-['Inter'] text-[13px] text-[#0A2540] leading-[1.5] py-1">
                  <span className="text-[#0F8A5F] font-bold flex-shrink-0">✓</span><span>{x}</span>
                </div>
              ))}
            </Block>
          )}

          {Array.isArray(report.what_to_watch) && report.what_to_watch.length > 0 && (
            <Block title="What to watch">
              {report.what_to_watch.map((x, i) => (
                <div key={i} className="flex gap-2 items-start bg-white border-l-[3px] border-[#D97706] rounded-[0_4px_4px_0] p-2.5 mb-1.5 font-['Inter'] text-[13px] text-[#0A2540] leading-[1.45]">
                  <span className="text-[#D97706] font-extrabold flex-shrink-0">!</span><span>{x}</span>
                </div>
              ))}
            </Block>
          )}

          {report.recommendation && (
            <Block title="Next week">
              <div className="bg-[#EBF1F5] border-l-[3px] border-[#0A2540] rounded-[0_6px_6px_0] p-3.5 font-['Inter'] text-[13px] leading-[1.6] text-[#0A2540]">{report.recommendation}</div>
            </Block>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <a href={`/dashboard/clients/${client.id}/programs`} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-3.5 py-2.5 rounded-[6px] transition-colors">Open programmes</a>
            <button onClick={onRetry} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-3.5 py-2.5 rounded-[6px] transition-colors">Regenerate</button>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone, delta, sub }) {
  const color = tone === 'good' ? 'text-[#0F8A5F]' : tone === 'warn' ? 'text-[#D97706]' : tone === 'bad' ? 'text-[#D92D20]' : 'text-[#0A2540]';
  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-2.5 text-center">
      <div className={`font-['Montserrat'] font-extrabold text-[19px] leading-none ${color}`}>{value}</div>
      {delta != null && delta !== 0 && (
        <div className={`font-['Inter'] text-[9px] font-bold mt-0.5 ${delta > 0 ? 'text-[#0F8A5F]' : 'text-[#D92D20]'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</div>
      )}
      {sub && <div className="font-['Inter'] text-[10px] text-[#8A95A3] mt-0.5">{sub}</div>}
      <div className="font-['Inter'] text-[8px] font-bold uppercase tracking-[0.1em] text-[#8A95A3] mt-1.5">{label}</div>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div className="mb-4">
      <div className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540] mb-2">{title}</div>
      {children}
    </div>
  );
}

function adhTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'warn';
  return 'bad';
}

function avgAdh(clients) {
  const vals = clients.map((c) => c.stats?.adherencePct).filter((v) => v != null);
  if (!vals.length) return '—';
  return `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`;
}

function fmtLong(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}
