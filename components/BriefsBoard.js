'use client';

import { useEffect, useState } from 'react';

export default function BriefsBoard({ clients, ptName }) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id || null);
  const [briefs, setBriefs] = useState({}); // id -> { loading, error, data }

  async function loadBrief(id) {
    setBriefs((b) => ({ ...b, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/briefs/${id}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not generate brief.');
      setBriefs((b) => ({ ...b, [id]: { data: j } }));
    } catch (e) {
      setBriefs((b) => ({ ...b, [id]: { error: e.message } }));
    }
  }

  function selectClient(id) {
    setSelectedId(id);
    if (!briefs[id] || briefs[id].error) loadBrief(id);
  }

  useEffect(() => {
    if (selectedId && !briefs[selectedId]) loadBrief(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = clients.find((c) => c.id === selectedId) || null;
  const state = selectedId ? briefs[selectedId] : null;

  return (
    <div className="flex h-screen">
      {/* Roster column */}
      <div className="w-[340px] flex-shrink-0 border-r border-[#E2E6EB] overflow-y-auto p-6 sm:p-7">
        <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-3">
          <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">This week</span>
        </div>
        <h1 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none mb-1">
          Pre-session briefs
        </h1>
        <p className="font-['Inter'] text-[13px] text-[#4A4A4A] mb-6">
          {clients.length} {clients.length === 1 ? 'athlete' : 'athletes'} on your roster. Pick one for the catch-up.
        </p>

        {clients.length === 0 ? (
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">No athletes yet.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => {
              const isSel = c.id === selectedId;
              const initials = (c.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <button
                  key={c.id}
                  onClick={() => selectClient(c.id)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-[8px] border transition-colors ${
                    isSel ? 'border-[#D92D20] border-2 bg-white' : 'border-[#E2E6EB] bg-white hover:bg-[#F4F6F8]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-[6px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-bold text-[13px] flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540] truncate">{c.name || 'Unnamed'}</div>
                    <div className="font-['Inter'] text-[11px] text-[#8A95A3] uppercase tracking-[0.5px]">{c.status || 'active'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Brief panel */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 min-w-0 bg-[#F4F6F8]">
        {!selected ? (
          <p className="font-['Inter'] text-[#8A95A3]">Select an athlete to see their brief.</p>
        ) : (
          <BriefPanel client={selected} state={state} onLogMeeting={() => logMeetingThenReload(selected.id, loadBrief)} onRetry={() => loadBrief(selected.id)} />
        )}
      </div>
    </div>
  );
}

async function logMeetingThenReload(id, loadBrief) {
  try {
    await fetch('/api/coach-meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: id }),
    });
  } catch {
    // non-fatal — reload anyway
  }
  loadBrief(id);
}

function BriefPanel({ client, state, onLogMeeting, onRetry }) {
  const initials = (client.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const data = state?.data;
  const brief = data?.brief;
  const since = data?.since;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div className="w-14 h-14 rounded-[8px] bg-[#0A2540] text-white grid place-items-center font-['Montserrat'] font-extrabold text-[18px] flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-none">{client.name}</h2>
          <div className="font-['Inter'] text-[13px] text-[#8A95A3] mt-1">
            {client.current_weight ? `${client.current_weight}kg` : ''}
            {client.target_weight ? ` → ${client.target_weight}kg target` : ''}
            {client.status ? ` · ${client.status}` : ''}
          </div>
        </div>
      </div>

      {/* Last met + log */}
      <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4 flex items-center justify-between gap-4 mb-5">
        <div>
          <div className="font-['Inter'] text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A95A3]">Last met</div>
          <div className="font-['Montserrat'] font-bold text-[15px] text-[#0A2540] mt-0.5">
            {since ? (since.logged ? `${since.days_ago} days ago` : 'No meeting logged yet') : '—'}
          </div>
        </div>
        <button
          onClick={onLogMeeting}
          className="bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.06em] px-4 py-2.5 rounded-[6px] transition-colors whitespace-nowrap"
        >
          ✓ Log meeting
        </button>
      </div>

      {state?.loading && (
        <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-6 text-center">
          <p className="font-['Inter'] text-[13px] text-[#8A95A3]">PAX is reading the last few weeks…</p>
        </div>
      )}

      {state?.error && (
        <div className="bg-white border-l-[3px] border-[#D92D20] rounded-[4px] p-4">
          <p className="font-['Inter'] text-sm text-[#0A2540]"><span className="font-bold">Couldn't generate:</span> {state.error}</p>
          <button onClick={onRetry} className="mt-2 font-['Inter'] font-semibold text-[12px] text-[#D92D20] uppercase tracking-[0.05em]">Try again</button>
        </div>
      )}

      {brief && (
        <>
          <Section title="Since you last met" tag="PAX">
            {Array.isArray(brief.since_summary) && brief.since_summary.length > 0 ? (
              <ul className="space-y-0">
                {brief.since_summary.map((s, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-1.5 border-b border-[#E2E6EB] last:border-b-0 font-['Inter'] text-[13.5px] text-[#0A2540]">
                    <span className="w-[6px] h-[6px] rounded-full bg-[#8A95A3] mt-2 flex-shrink-0" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty />}
          </Section>

          {brief.why && (
            <Section title="The why">
              <p className="font-['Inter'] text-[13.5px] leading-[1.6] text-[#4A4A4A]">{brief.why}</p>
            </Section>
          )}

          {Array.isArray(brief.red_flags) && brief.red_flags.length > 0 && (
            <Section title="Focus today">
              <div className="space-y-2">
                {brief.red_flags.map((f, i) => (
                  <div key={i} className="flex gap-2.5 items-start bg-white border border-[#F0997B] border-l-[3px] border-l-[#D92D20] rounded-[0_6px_6px_0] p-3 font-['Inter'] text-[13px] text-[#0A2540] leading-[1.45]">
                    <span className="text-[#D92D20] font-extrabold flex-shrink-0">!</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {Array.isArray(brief.suggested_actions) && brief.suggested_actions.length > 0 && (
            <Section title="Suggested moves">
              <ul className="space-y-0">
                {brief.suggested_actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 items-start py-1.5 border-b border-[#E2E6EB] last:border-b-0 font-['Inter'] text-[13.5px] text-[#0A2540]">
                    <span className="w-[18px] h-[18px] rounded-[4px] bg-[#0A2540] text-white grid place-items-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief.safety_check && (
            <Section title="Safety check">
              <p className={`font-['Inter'] text-[13px] leading-[1.5] ${/no conflict/i.test(brief.safety_check) ? 'text-[#0F8A5F]' : 'text-[#D92D20] font-medium'}`}>
                {brief.safety_check}
              </p>
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

function Section({ title, tag, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-['Montserrat'] font-bold text-[11px] tracking-[0.16em] uppercase text-[#0A2540]">{title}</span>
        {tag && <span className="font-['Inter'] text-[9px] font-bold tracking-[0.1em] bg-[#0A2540] text-white px-1.5 py-0.5 rounded-[3px]">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="font-['Inter'] text-[13px] text-[#8A95A3] italic">Not enough data in this window yet.</p>;
}
