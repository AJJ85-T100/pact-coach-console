'use client';

import { useEffect, useState } from 'react';

const MOMENTUM = {
  building: { label: 'Building', color: '#0F8A5F', bg: '#E7F4EF' },
  steady: { label: 'Steady', color: '#0A2540', bg: '#EBF1F5' },
  slipping: { label: 'Slipping', color: '#D97706', bg: '#FDF1E3' },
  stalled: { label: 'Stalled', color: '#D92D20', bg: '#FBE9E7' },
};

function momentumOf(key) {
  return MOMENTUM[String(key || '').toLowerCase()] || MOMENTUM.steady;
}

export default function ReportsBoard({ clients, ptName }) {
  const [selectedId, setSelectedId] = useState(clients?.[0]?.id || null);
  const [reports, setReports] = useState({}); // id -> { loading, error, data }

  async function loadReport(id) {
    setReports((r) => ({ ...r, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/reports/${id}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not generate report.');
      setReports((r) => ({ ...r, [id]: { data: j } }));
    } catch (e) {
      setReports((r) => ({ ...r, [id]: { error: e.message } }));
    }
  }

  function selectClient(id) {
    setSelectedId(id);
    if (!reports[id] || reports[id].error) loadReport(id);
  }

  useEffect(() => {
    if (selectedId && !reports[selectedId]) loadReport(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = clients.find((c) => c.id === selectedId) || null;
  const state = selectedId ? reports[selectedId] : null;

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  return (
    <div className="flex h-screen">
      {/* Roster column */}
      <div className="w-[340px] flex-shrink-0 border-r border-[#E2E6EB] overflow-y-auto p-6 bg-white">
        <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
          <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">This week</span>
        </div>
        <h1 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none mb-1">
          PAX reports
        </h1>
        <p className="font-['Inter'] text-[13px] text-[#4A4A4A] mb-6">The week behind, per athlete · {today}</p>

        {clients.length === 0 ? (
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">No athletes yet.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <ReportCard
                key={c.id}
                client={c}
                selected={c.id === selectedId}
                report={reports[c.id]?.data?.report}
                loading={reports[c.id]?.loading}
                onSelect={selectClient}
              />
            ))}
          </div>
        )}
      </div>

      {/* Report panel */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-w-0 bg-[#F4F6F8]">
        {!selected ? (
          <p className="font-['Inter'] text-[#8A95A3]">Select an athlete to read their week.</p>
        ) : (
          <ReportPanel client={selected} state={state} onRetry={() => loadReport(selected.id)} />
        )}
      </div>
    </div>
  );
}

function ReportCard({ client, selected, report, loading, onSelect }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const m = report ? momentumOf(report.momentum) : null;
  return (
    <button
      onClick={() => onSelect(client.id)}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-[8px] border transition-colors ${
        selected ? 'border-[#D92D20] border-2 bg-white' : 'border-[#E2E6EB] bg-white hover:bg-[#F4F6F8]'
      }`}
    >
      <div className="w-10 h-10 rounded-[6px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-bold text-[13px] flex-shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] truncate">{client.name || 'Unnamed'}</span>
          {m && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />}
        </div>
        <div className="font-['Inter'] text-[11px] text-[#8A95A3] truncate mt-0.5">
          {report?.headline ? report.headline : loading ? 'Reading the week\u2026' : (client.status || 'Tap to generate')}
        </div>
      </div>
    </button>
  );
}

function ReportPanel({ client, state, onRetry }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const data = state?.data;
  const report = data?.report;
  const stats = data?.stats;
  const m = report ? momentumOf(report.momentum) : null;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[18px] flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[13px] text-[#8A95A3] mt-1">Week to {data ? new Date(data.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '\u2014'}</div>
        </div>
      </div>

      {state?.loading && (
        <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-6 text-center">
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is writing the week up\u2026</p>
        </div>
      )}

      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn\u2019t generate:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {report && (
        <>
          {/* Headline hero */}
          <div className="bg-white border border-[#E2E6EB] rounded-[10px] p-6 mb-5" style={{ borderLeft: `4px solid ${m.color}` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: m.color, background: m.bg, padding: '3px 8px', borderRadius: '4px' }}>
                {m.label}
              </span>
            </div>
            <div className="font-['Montserrat'] font-extrabold text-[26px] leading-[1.1] text-[#0A2540]">{report.headline}</div>
          </div>

          {/* Stat tiles */}
          {stats && (
            <div className="grid grid-cols-4 gap-2 mb-5">
              <StatTile
                label="Adherence"
                value={stats.adherence_pct == null ? '\u2014' : `${stats.adherence_pct}%`}
                tone={adherenceTone(stats.adherence_pct)}
                delta={stats.delta}
              />
              <StatTile label="Pacts kept" value={`${stats.wins}/${stats.win_total}`} />
              <StatTile label="Days tracked" value={String(stats.days_logged)} />
              <StatTile label="Best streak" value={stats.top_streak > 0 ? String(stats.top_streak) : '\u2014'} />
            </div>
          )}

          {Array.isArray(report.what_worked) && report.what_worked.length > 0 && (
            <Section title="What worked">
              <ul className="bg-white border border-[#E2E6EB] rounded-[8px] px-4">
                {report.what_worked.map((s, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-2.5 border-b border-[#E2E6EB] last:border-b-0 font-['Inter'] text-[13.5px] text-[#0A2540] leading-[1.5]">
                    <span className="text-[#0F8A5F] font-bold flex-shrink-0">\u2713</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(report.what_to_watch) && report.what_to_watch.length > 0 && (
            <Section title="What to watch">
              <div className="space-y-2">
                {report.what_to_watch.map((f, i) => (
                  <div key={i} className="flex gap-2.5 items-start bg-white border border-[#E2E6EB] border-l-[3px] border-l-[#D97706] rounded-[0_6px_6px_0] p-3 font-['Inter'] text-[13px] text-[#0A2540] leading-[1.45]">
                    <span className="text-[#D97706] font-extrabold flex-shrink-0">!</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {report.recommendation && (
            <Section title="Next week">
              <div className="bg-[#EBF1F5] border-l-[3px] border-[#0A2540] rounded-[0_6px_6px_0] p-4 font-['Inter'] text-[13.5px] leading-[1.6] text-[#0A2540]">
                {report.recommendation}
              </div>
            </Section>
          )}

          <div className="flex gap-2 mt-6">
            <a href={`/dashboard/clients/${client.id}/programs`} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors">Open programmes</a>
            <button onClick={onRetry} className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors">Regenerate</button>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone, delta }) {
  const color = tone === 'good' ? 'text-[#0F8A5F]' : tone === 'warn' ? 'text-[#D97706]' : tone === 'bad' ? 'text-[#D92D20]' : 'text-[#0A2540]';
  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-3 text-center">
      <div className={`font-['Montserrat'] font-extrabold text-2xl leading-none ${color}`}>{value}</div>
      {delta != null && delta !== 0 && (
        <div className={`font-['Inter'] text-[10px] font-bold mt-1 ${delta > 0 ? 'text-[#0F8A5F]' : 'text-[#D92D20]'}`}>
          {delta > 0 ? '\u25b2' : '\u25bc'} {Math.abs(delta)} pts
        </div>
      )}
      <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A95A3] mt-1.5">{label}</div>
    </div>
  );
}

function adherenceTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'warn';
  return 'bad';
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <div className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540] mb-2.5">{title}</div>
      {children}
    </div>
  );
}
