'use client';

/**
 * useNeedsYou — the coach's V2 queue (escalations, drafts, drifting athletes,
 * consent needed) and the actions on it. Shared by NeedsYouToday (whole
 * roster, My Day) and the athlete page's "Do this next" (one athlete).
 *
 * Every action goes through /api/needs-you/[id] → the engine, which checks
 * ownership and writes the coach_labels row. Never write V2 rows from here.
 */
import { useCallback, useEffect, useState } from 'react';

export function ago(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function humanAngle(a) {
  return String(a).replace(/_/g, ' ');
}

export const SLOT = { morning: 'Morning', midday: 'Midday', evening: 'Evening' };

/**
 * @param opts.pollMs  refresh interval (default 60s)
 * @param opts.onDone  called after a successful action (e.g. router.refresh)
 */
export function useNeedsYou({ pollMs = 60000, onDone } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({});
  const [editing, setEditing] = useState({});
  const [linkResult, setLinkResult] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/needs-you', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load.');
    }
  }, []);

  useEffect(() => {
    load();
    if (!pollMs) return undefined;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  async function act(id, body) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/needs-you/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || j.message || `Failed (${res.status})`);
      setEditing((e) => ({ ...e, [id]: undefined }));
      await load();
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
      // The engine may have moved the item on (e.g. an expired draft is
      // suppressed with a 410), so refresh what's shown.
      await load();
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function sendConsent(clientId) {
    setBusy((b) => ({ ...b, [clientId]: true }));
    try {
      const res = await fetch(`/api/needs-you/${clientId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'consent' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setLinkResult((r) => ({ ...r, [clientId]: j }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [clientId]: false }));
    }
  }

  return { data, error, busy, editing, setEditing, linkResult, load, act, sendConsent };
}
