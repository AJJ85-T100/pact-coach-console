'use client';

/**
 * One fetch of the coach's V2 queue (useNeedsYou) and of the engine's
 * autonomy suggestions, shared by the header count and every Today card,
 * so the number at the top always matches the cards below it.
 *
 * Every action still goes through the engine (/api/needs-you/[id],
 * /api/autonomy), which checks ownership and writes coach_labels.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNeedsYou, humanAngle } from '@/components/needs-you/useNeedsYou';

const Ctx = createContext(null);
const DISMISS_KEY = 'pact.today.keepReviewing';

function readDismissed() {
  try {
    const v = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Angles the coach approves unchanged nearly every time: "routine". */
export function approvedOften(a) {
  if (!a || a.locked) return false;
  const decided = (a.approved || 0) + (a.edited || 0) + (a.rejected || 0);
  return decided >= 3 && (a.approvedUnchanged || 0) / decided >= 0.8;
}

export function TodayProvider({ drifting = [], hasState = false, children }) {
  const router = useRouter();
  const needs = useNeedsYou({ onDone: () => router.refresh() });

  // Autonomy: 'loading' → 'ok' | 'off' (404 / not deployed / any error: card hidden)
  const [auto, setAuto] = useState({ status: 'loading', angles: [] });
  const [dismissed, setDismissed] = useState([]);
  const [autoBusy, setAutoBusy] = useState({});
  const [autoMsg, setAutoMsg] = useState(null);

  const loadAutonomy = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomy', { cache: 'no-store' });
      if (!res.ok) { setAuto({ status: 'off', angles: [] }); return; }
      const j = await res.json();
      setAuto({ status: 'ok', angles: Array.isArray(j.angles) ? j.angles : [], days: j.days ?? null });
    } catch {
      setAuto({ status: 'off', angles: [] });
    }
  }, []);

  useEffect(() => { setDismissed(readDismissed()); loadAutonomy(); }, [loadAutonomy]);

  const dismiss = useCallback((angle) => {
    setDismissed((d) => {
      const next = [...new Set([...d, angle])];
      try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* private mode: dismiss for this visit only */ }
      return next;
    });
  }, []);

  const setAngleAuto = useCallback(async (angle, on) => {
    setAutoBusy((b) => ({ ...b, [angle]: true }));
    setAutoMsg(null);
    try {
      const res = await fetch('/api/autonomy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ angle, auto: on }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503) setAutoMsg('PAX can’t take this on yet: it needs a database update first.');
      else if (res.status === 400) setAutoMsg(j.error || j.message || 'PAX can’t send that kind of message on its own.');
      else if (!res.ok) setAutoMsg(j.error || j.message || 'Couldn’t save that. Try again in a minute.');
      await loadAutonomy();
    } catch {
      setAutoMsg('Couldn’t reach PAX. Try again in a minute.');
    } finally {
      setAutoBusy((b) => ({ ...b, [angle]: false }));
    }
  }, [loadAutonomy]);

  const value = useMemo(() => {
    const angles = auto.angles || [];
    const labelOf = (angle) => angles.find((a) => a.angle === angle)?.label || humanAngle(angle);
    const suggestions = angles.filter((a) => a.suggest && !a.locked && !a.auto && !dismissed.includes(a.angle));
    const routine = new Set(angles.filter(approvedOften).map((a) => a.angle));
    const d = needs.data;
    // Drifting = latest slip-risk band (the athlete page's definition), with
    // the engine's reason added where it has one. Only when no athlete has a
    // nightly snapshot yet do we fall back to the engine's own drifting list.
    const engineRisk = d?.atRisk || [];
    const reasonBy = Object.fromEntries(engineRisk.map((a) => [a.clientId, (a.reasons || []).join(' · ')]));
    const driftList = hasState
      ? drifting.map((x) => ({ ...x, reason: reasonBy[x.clientId] || x.reason }))
      : engineRisk.map((a) => ({ clientId: a.clientId, athlete: a.athlete, score: null, reason: (a.reasons || []).join(' · ') }));
    const count = d
      ? (d.escalations?.length || 0) + (d.moves?.length || 0) + (d.drafts?.length || 0) + (d.needConsent?.length || 0) + driftList.length + suggestions.length
      : null;
    return { ...needs, autonomy: { ...auto, suggestions, routine, labelOf, dismiss, setAngleAuto, busy: autoBusy, msg: autoMsg }, driftList, count };
  }, [needs, auto, dismissed, drifting, hasState, dismiss, setAngleAuto, autoBusy, autoMsg]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToday() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToday must be used inside TodayProvider');
  return v;
}
