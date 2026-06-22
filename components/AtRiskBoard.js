'use client';

import { useState, useEffect, useRef } from 'react';

const DAY = 86400000;

function band(score) {
  const s = score == null ? 50 : score;
  if (s >= 70) return { color: '#D92D20', bg: '#FBEBEA', tx: '#A32D2D', label: 'High risk' };
  if (s >= 45) return { color: '#D97706', bg: '#FBF0DE', tx: '#92560A', label: 'Elevated' };
  return { color: '#D97706', bg: '#FBF5E8', tx: '#92560A', label: 'Watch' };
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const ICONS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trend: <path d="M4 17l5-5 4 4 7-8" />,
  check: <path d="M5 12l4 4 10-10" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
};
function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }}>
      {ICONS[name]}
    </svg>
  );
}

export default function AtRiskBoard({ clients, ptName }) {
  const [roster, setRoster] = useState(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [copied, setCopied] = useState(false);

  const [listWidth, setListWidth] = useState(340);
  const [dragging, setDragging] = useState(false);
  const listWidthRef = useRef(340);
  const draggingRef = useRef(false);
  const rowRef = useRef(null);

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

  useEffect(() => {
    try {
      const saved = parseInt(localStorage.getItem('pact_atrisk_list_w') || '', 10);
      if (saved >= 260 && saved <= 680) { setListWidth(saved); listWidthRef.current = saved; }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current || !rowRef.current) return;
      const left = rowRef.current.getBoundingClientRect().left;
      const w = Math.max(260, Math.min(680, e.clientX - left));
      listWidthRef.current = w;
      setListWidth(w);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      try { localStorage.setItem('pact_atrisk_list_w', String(listWidthRef.current)); } catch { /* noop */ }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startDrag(e) { e.preventDefault(); draggingRef.current = true; setDragging(true); }

  const all = roster?.clients || (clients || []).map((c) => ({ id: c.id, name: c.name, status: 'at_risk', stats: {} }));
  const flagged = all
    .filter((c) => c.status === 'at_risk' || c.status === 'watch')
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));

  async function loadDraft(id) {
    setDrafts((d) => ({ ...d, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/at-risk/${id}`, { method: 'POST', cache: 'no-store' });
      const text = await res.text();
      let j = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = {}; }
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status}).`);
      if (!j.draft_message && !j.diagnosis) throw new Error(j.error || 'PAX returned an empty draft.');
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
      <style dangerouslySetInnerHTML={{ __html: `
@keyframes arxenter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes arxfill{from{width:0}}
@keyframes arxpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
.arx-enter{animation:arxenter .3s ease both}
.arx-fill{animation:arxfill .6s cubic-bezier(.2,.7,.3,1) both}
.arx-pulse{animation:arxpulse 1.6s ease-in-out infinite}
.arx-row{transition:transform .14s ease,border-color .14s ease}
.arx-row:hover{transform:translateX(3px)}
` }} />

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
          <div ref={rowRef} className={`flex ${dragging ? 'select-none' : ''}`}>
            {/* List */}
            <div style={{ width: listWidth }} className="flex-shrink-0 space-y-2">
              {flagged.map((c) => {
                const b = band(c.risk_score);
                const isSel = c.id === selectedId;
                const ds = c.days_silent;
                return (
                  <button
                    key={c.id}
                    onClick={() => select(c.id)}
                    className={`arx-row w-full text-left flex items-center gap-3 bg-white rounded-[8px] p-3 border ${isSel ? 'border-[#0A2540] border-2' : 'border-[#E2E6EB] hover:border-[#0A2540]'}`}
                  >
                    <span className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="w-9 h-9 rounded-full bg-[#EBF1F5] grid place-items-center font-['Montserrat'] font-bold text-[12px] text-[#0A2540] flex-shrink-0">{initials(c.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] leading-tight truncate">{c.name}</span>
                        {c.risk_score >= 70 && <span className="arx-pulse w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: '#D92D20' }} />}
                      </span>
                      <span className="flex items-center gap-2 mt-1.5">
                        <span className="flex-1 h-[5px] rounded-full bg-[#EEF1F4] overflow-hidden">
                          <span className="arx-fill block h-full rounded-full" style={{ width: `${c.risk_score ?? 0}%`, background: b.color }} />
                        </span>
                        <span className="font-['Montserrat'] font-extrabold text-[11px] whitespace-nowrap" style={{ color: b.color }}>
                          {ds == null ? '—' : `${ds}d`}
                        </span>
                      </span>
                    </span>
                    <span className="font-['Inter'] text-[9.5px] font-bold uppercase tracking-[0.08em] px-2 py-1 rounded-[4px] flex-shrink-0" style={{ color: b.tx, background: b.bg }}>{b.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Draggable divider */}
            <div onMouseDown={startDrag} className="w-4 flex-shrink-0 cursor-col-resize flex items-center justify-center group" title="Drag to resize">
              <div className={`w-px h-full transition-colors ${dragging ? 'bg-[#0A2540]' : 'bg-[#E2E6EB] group-hover:bg-[#0A2540]'}`} />
            </div>

            {/* Detail */}
            <div className="flex-1 min-w-0">
              {!selected ? (
                <div className="bg-white border border-[#E2E6EB] rounded-[10px] p-8 text-center">
                  <p className="font-['Inter'] text-sm text-[#8A95A3]">Pick a client to see why they're flagged and the message PAX suggests.</p>
                </div>
              ) : (
                <DetailPanel key={selected.id} client={selected} state={state} copied={copied} onCopy={copyMsg} onRetry={() => loadDraft(selected.id)} />
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
  const sig = data?.signals || {};
  const score = client.risk_score ?? 50;
  const b = band(score);
  const stats = client.stats || {};

  const daysSilent = sig.days_silent != null ? sig.days_silent : client.days_silent;
  const adherence = sig.adherence_pct != null ? sig.adherence_pct : stats.adherencePct;
  const daysLogged = sig.days_logged != null ? sig.days_logged : stats.daysLogged;
  const lastSeen = client.last_activity || sig.last_activity
    || (daysSilent != null ? new Date(Date.now() - daysSilent * DAY).toISOString().slice(0, 10) : null);

  return (
    <div className="arx-enter bg-white border border-[#E2E6EB] rounded-[10px] shadow-[0_4px_10px_rgba(10,37,64,0.05)] p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[#E2E6EB]">
        <div className="w-12 h-12 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[16px] flex-shrink-0">{initials(client.name)}</div>
        <div className="min-w-0 flex-1">
          <h2 className="font-['Montserrat'] font-extrabold text-[20px] text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[12px] text-[#8A95A3] mt-1">{client.goal || data?.client?.goal || 'No goal set'}</div>
        </div>
        <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-[5px] flex-shrink-0" style={{ color: b.tx, background: b.bg }}>{b.label}</span>
      </div>

      {/* Risk meter */}
      <div className="flex items-center gap-3 mb-4">
        <span className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3]">Risk</span>
        <span className="flex-1 h-2 rounded-full bg-[#EEF1F4] overflow-hidden">
          <span className="arx-fill block h-full rounded-full" style={{ width: `${score}%`, background: b.color }} />
        </span>
        <span className="font-['Montserrat'] font-extrabold text-[14px]" style={{ color: b.color }}>{score}</span>
      </div>

      {data?.why_now && (
        <div className="font-['Montserrat'] font-extrabold text-[16px] leading-[1.25] text-[#0A2540] mb-4">{data.why_now}</div>
      )}

      {/* Signal tiles — render immediately from roster data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Tile label={<><Icon name="clock" />Days silent</>} value={daysSilent == null ? '—' : String(daysSilent)} tone={daysSilent != null && daysSilent >= 7 ? 'bad' : 'neutral'} />
        <Tile label={<><Icon name="trend" />Adherence</>} value={adherence == null ? '—' : `${adherence}%`} tone={adherence != null && adherence < 30 ? 'bad' : adherence != null && adherence < 55 ? 'warn' : 'neutral'} />
        <Tile label={<><Icon name="check" />Days logged</>} value={daysLogged == null ? '—' : `${daysLogged}/7`} />
        <Tile label={<><Icon name="calendar" />Last seen</>} value={lastSeen ? new Date(lastSeen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'} />
      </div>

      {state?.loading && <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is reading the signals…</p>}

      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn't draft:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {data?.diagnosis && (
        <div className="mb-4">
          <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-1.5">Why they're slipping</div>
          <p className="font-['Inter'] text-[14px] leading-[1.55] text-[#0A2540]">{data.diagnosis}</p>
        </div>
      )}

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

      {data?.draft_message && (
        <div>
          <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3] mb-1.5"><Icon name="message" />Suggested check-in</div>
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
    </div>
  );
}

function Tile({ label, value, tone }) {
  const color = tone === 'bad' ? 'text-[#D92D20]' : tone === 'warn' ? 'text-[#D97706]' : 'text-[#0A2540]';
  return (
    <div className="bg-[#F4F6F8] rounded-[6px] p-3">
      <div className="font-['Inter'] text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A95A3] mb-1 flex items-center">{label}</div>
      <div className={`font-['Montserrat'] font-extrabold text-[18px] leading-none ${color}`}>{value}</div>
    </div>
  );
}
