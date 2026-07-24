'use client';

import { useEffect, useState } from 'react';

/**
 * CalendarConnect — the coach's Google Calendar connection, on Settings.
 *
 * Connected: every session scheduled in the Briefs board lands straight in
 * their Google Calendar (and cancelling removes it). Not connected: the
 * platform falls back to emailing a calendar invite (.ics), which Google,
 * Outlook and Apple all accept — so this is an upgrade, not a requirement.
 */
export default function CalendarConnect() {
  const [state, setState] = useState(null);   // null = loading
  const [busy, setBusy] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/calendar', { cache: 'no-store' });
      setState(await res.json());
    } catch {
      setState({ configured: false, connected: false });
    }
  }

  useEffect(() => {
    load();
    // Back from Google? (?calendar=connected|declined|retry)
    const q = new URLSearchParams(window.location.search).get('calendar');
    if (q === 'connected') {
      setJustConnected(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch('/api/calendar', { method: 'DELETE' });
      await load();
    } catch {}
    setBusy(false);
  }

  if (state === null) {
    return <p className="font-['Inter'] text-[12px] text-[#8A95A3]">Checking calendar connection…</p>;
  }

  if (!state.configured) {
    return (
      <p className="font-['Inter'] text-[12.5px] text-[#8A95A3] leading-relaxed">
        Calendar connections aren&apos;t switched on for this platform yet. Scheduled sessions
        will be emailed to you as calendar invites once email is configured.
      </p>
    );
  }

  return (
    <div className="bg-white border border-[#E2E6EB] rounded-[8px] p-4">
      {justConnected && (
        <div className="mb-3 font-['Inter'] text-[12px] font-semibold text-[#12805C] bg-[#E8F5EF] border border-[#BFE5D5] rounded-[6px] px-3 py-2">
          Google Calendar connected — new sessions you schedule will appear in your diary.
        </div>
      )}

      {state.connected ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540]">Google Calendar connected</div>
            <div className="font-['Inter'] text-[12px] text-[#8A95A3]">
              {state.email || 'Connected'} · sessions you schedule land in your diary automatically
            </div>
          </div>
          <button
            onClick={disconnect}
            disabled={busy}
            className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.05em] text-[#8A95A3] hover:text-[#D92D20] disabled:opacity-50"
          >
            {busy ? 'Removing…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-['Montserrat'] font-bold text-[14px] text-[#0A2540]">Google Calendar</div>
            <div className="font-['Inter'] text-[12px] text-[#8A95A3] leading-relaxed">
              Connect it and every client session you schedule is added to your diary — cancel
              in the console and it disappears too. Not connected, you&apos;ll get an email invite instead.
            </div>
          </div>
          {state.connectUrl ? (
            <a
              href={state.connectUrl}
              className="bg-[#0A2540] hover:bg-[#0F3155] text-white font-['Inter'] font-semibold text-[11px] uppercase tracking-[0.06em] px-3.5 py-2 rounded-[6px] transition-colors whitespace-nowrap"
            >
              Connect
            </a>
          ) : (
            <span className="font-['Inter'] text-[11px] text-[#8A95A3]">Unavailable</span>
          )}
        </div>
      )}
    </div>
  );
}
