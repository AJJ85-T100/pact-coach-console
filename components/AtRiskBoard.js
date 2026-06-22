'use client';

import { useState, useEffect } from 'react';

const STATUS = {
  at_risk: { label: 'At risk', color: '#D92D20', bg: '#FBEBEA' },
  watch: { label: 'Watch', color: '#D97706', bg: '#FBF0DE' },
};
const RISK = {
  high: { label: 'High risk', color: '#D92D20', bg: '#FBEBEA' },
  moderate: { label: 'Moderate', color: '#D97706', bg: '#FBF0DE' },
  low: { label: 'Lower risk', color: '#0F8A5F', bg: '#E6F3EE' },
};
const riskOf = (k) => RISK[String(k || '').toLowerCase()] || RISK.moderate;

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function AtRiskBoard({ clients, ptName }) {
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/reports/roster?weeks_ago=0', { cache: 'no-store' });
        const j = await res.json();
        if (alive) setRoster(j);
      } catch {
        if (alive) setRoster({ clients: [] });
      } finally {
        if (alive) setLoadingRoster(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const all = roster?.clients || (clients || []).map((c) => ({ id: c.id, name: c.name, status: 'at_risk', stats: {} }));
  const flagged = all
    .filter((c) => c.status === 'at_risk' || c.status === 'watch')
    .sort((a, b) => {
      const rank = (s) => (s === 'at_risk' ? 0 : 1);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      const da = a.stats?.daysLogged ?? 0, db = b.stats?.daysLogged ?? 0;
      if (da !== db) return da - db;
      return (a.stats?.adherencePct ?? 0) - (b.stats?.adherencePct ?? 0);
    });

  async function loadDraft(id) {
    setDrafts((d) => ({ ...d, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/at-risk/${id}`, { method: 'POST', cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not draft a message.');
      setDrafts((d) => ({ ...d, [id]: { data: j } }));
    } catch (e) {
      setDrafts((d) => ({ ...d, [id]: { error: e.message } }));
    }
  }

  function select(id) {
    setSelectedId(id);
    setCopied(false);
    if (!drafts[id]) loadDraft(id);
  }

  function copyMsg(msg) {
    try { navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* noop */ }
  }

  const selected = flagged.find((c) => c.id === selectedId) || null;
  const state = selectedId ? drafts[selectedId] : null;

  return (
    <>
      {/* Header band */}
      <section className="bg-[#0A2540] text-white px-8 lg:px-10 py-8">
        <p className="font-['Inter'] text-[11px] font-semibold text-[#D92D20] tracking-[0.25em] uppercase mb-2">This week</p>
        <h1 className="font-['Montserrat'] font-extrabold text-3xl lg:text-4xl uppercase tracking-tight leading-none">At-risk clients</h1>
        <p className="text-white/70 text-sm mt-2 max-w-2xl">
          The athletes quietly slipping — ranked by risk, with a check-in PAX has drafted for you. Reach them before they ghost.
        </p>
      </section>

      <div className="px-8 lg:px-10 py-8">
        {loadingRoster ? (
          <p className="font-['Inter'] text-sm text-[#8A95A3]">Reading the roster…</p>
        ) : flagged.length === 0 ? (
          <div className="bg-white border border-[#E2E6EB] rounded-[10px] shadow-[0_4px_10px_rgba(10,37,64,0.05)] p-8 max-w-xl">
            <div className="font-['Montserrat'] font-extrabold text-[18px] text-[#0A2540] uppercase tracking-tight mb-2">Nobody's slipping</div>
            <p className="font-['Inter'] text-sm text-[#4A4A4A]">Every active athlete is holding their pacts this week. PAX will flag anyone who starts to drift — you'll see them here first.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-5">
            {/* List */}
            <div className="lg:w-[340px] flex-shrink-0 space-y-2">
              {flagged.map((c) => {
                const st = STATUS[c.status] || STATUS.watch;
                const s = c.stats || {};
                const isSel = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    className={`w-full text-left flex items-center gap-3 bg-white rounded-[8px] p-3 border transition-colors ${isSel ? 'border-[#0A2540]' : 'border-[#E2E6EB] hover:border-[#0A2540]'}`}
                  >
                    <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: st.color }} />
                    <span className="w-9 h-9 rounded-full bg-[#EBF1F5] grid place-items-center font-['Montserrat'] font-bold text-[12px] text-[#0A2540] flex-shrink-0">{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-['Montserrat'] font-bold text-[14px] text-[#0A2540] leading-tight truncate">{c.name}</span>
                      <span className="block font-['Inter'] text-[11px] text-[#8A95A3] truncate">
                        {s.adherencePct != null ? `${s.adherencePct}% adherence` : 'no data this week'}{s.daysLogged != null ? ` · ${s.daysLogged}/7 days logged` : ''}
                      </span>
                    </span>
                    <span className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-[4px] flex-shrink-0" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Detail */}
            <div className="flex-1 min-w-0">
              {!selected ? (
                <div className="bg-white border border-[#E2E6EB] rounded-[10px] p-8 text-center">
                  <p className="font-['Inter'] text-sm text-[#8A95A3]">Pick a client to see why they're flagged and the message PAX suggests.</p>
                </div>
              ) : (
                <DetailPanel client={selected} state={state} copied={copied} onCopy={copyMsg} onRetry={() => loadDraft(selected.id)} />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function DetailPanel({ client, state, copied, onCopy, onRetry }) {
  const data = state?.data;
  const sig = data?.signals;
  const r = riskOf(data?.risk_level);

  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[10px] shadow-[0_4px_10px_rgba(10,37,64,0.05)] p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[#E2E6EB]">
        <div className="w-12 h-12 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[16px] flex-shrink-0">{initials(client.name)}</div>
        <div className="min-w-0 flex-1">
          <h2 className="font-['Montserrat'] font-extrabold text-[20px] text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[12px] text-[#8A95A3] mt-1">{client.goal || data?.client?.goal || 'No goal set'}</div>
        </div>
        {data && (
          <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-[5px] flex-shrink-0" style={{ color: r.color, background: r.bg }}>{r.label}</span>
        )}
      </div>

      {state?.loading && <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is reading the signals…</p>}

      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn't draft:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {data && (
        <>
          {data.why_now && (
            <div className="font-['Montserrat'] font-extrabold text-[16px] leading-[1.2] text-[#0A2540] mb-4">{data.why_now}</div>
          )}

          {/* Signal tiles */}
          {sig && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <Tile label="Days silent" value={sig.days_silent == null ? '—' : String(sig.days_silent)} tone={sig.days_silent != null && sig.days_silent >= 3 ? 'bad' : 'neutral'} />
              <Tile label="Adherence" value={sig.adherence_pct == null ? '—' : `${sig.adherence_pct}%`} tone={sig.adherence_pct != null && sig.adherence_pct < 30 ? 'bad' : sig.adherence_pct != null && sig.adherence_pct < 55 ? 'warn' : 'neutral'} />
              <Tile label="Days logged" value={sig.days_logged == null ? '—' : `${sig.days_logged}/7`} />
              <Tile label="Last seen" value={sig.last_activity ? new Date(sig.last_activity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'} />
            </div>
          )}

          {/* Diagnosis */}
          {data.diagnosis && (
            <div className="mb-4">
              <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-1.5">Why they're slipping</div>
              <p className="font-['Inter'] text-[14px] leading-[1.55] text-[#0A2540]">{data.diagnosis}</p>
            </div>
          )}

          {/* Broken pacts */}
          {sig?.broken_pacts?.length > 0 && (
            <div className="mb-4">
              <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-1.5">Lapsed pacts</div>
              <ul className="space-y-1">
                {sig.broken_pacts.map((p, i) => (
                  <li key={i} className="font-['Inter'] text-[13px] text-[#4A4A4A] flex gap-2"><span className="text-[#D97706] font-bold flex-shrink-0">·</span><span>{p}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* Drafted message */}
          {data.draft_message && (
            <div>
              <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-1.5">Suggested check-in</div>
              <div className="bg-[#EBF1F5] border-l-[3px] border-[#0A2540] rounded-[0_8px_8px_0] p-4 font-['Inter'] text-[14px] leading-[1.55] text-[#0A2540]">
                {data.draft_message}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => onCopy(data.draft_message)}
                  className="bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors"
                >
                  {copied ? 'Copied ✓' : 'Copy message'}
                </button>
                <button
                  onClick={onRetry}
                  className="bg-white border border-[#E2E6EB] hover:border-[#0A2540] text-[#0A2540] font-['Inter'] font-semibold text-[12px] uppercase tracking-[0.05em] px-4 py-2.5 rounded-[6px] transition-colors"
                >
                  Redraft
                </button>
              </div>
              <p className="font-['Inter'] text-[11px] text-[#8A95A3] mt-2.5 leading-[1.5]">
                PAX drafted this — no guilt, no plan-talk, just a door back in. Send it from WhatsApp now; one-tap send from here arrives once the channel is connected.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone }) {
  const color = tone === 'bad' ? 'text-[#D92D20]' : tone === 'warn' ? 'text-[#D97706]' : 'text-[#0A2540]';
  return (
    <div className="bg-[#F4F6F8] rounded-[6px] p-3">
      <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.12em] text-[#8A95A3] mb-1">{label}</div>
      <div className={`font-['Montserrat'] font-extrabold text-[18px] leading-none ${color}`}>{value}</div>
    </div>
  );
}
