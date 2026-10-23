'use client';

/**
 * useNeedsYou — the coach's V2 queue (escalations, athletes going quiet,
 * drafts, drifting athletes, consent needed) and the actions on it. Shared
 * by NeedsYouToday (whole roster, My Day) and the athlete page's "Do this
 * next" (one athlete).
 *
 * Every action goes through /api/needs-you/[id] → the engine, which checks
 * ownership and writes the coach_labels row. Never write V2 rows from here.
 */
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
 * The Cortex's quiet signals (engine domain/quiet.ts), as the coach reads
 * them. Unknown keys fall back to the key with its casing spelled out.
 */
const QUIET_SIGNAL = { logging: 'logging', reply: 'replies', checkin: 'check-in', focus: 'focus', mood: 'mood', weighIn: 'weigh-ins' };
export function quietSignalLabel(k) {
  return QUIET_SIGNAL[k] ?? String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

/**
 * Live: a new escalation or draft is an interventions row, published to
 * Supabase Realtime (migration 2026-10-18_realtime_interventions.sql). Any
 * change is only a nudge to re-ask the engine, which stays the source of
 * truth; RLS means a coach hears only about their own athletes. The poll
 * stays as a safety net (and is all there is until the migration runs).
 *
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

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return undefined; // no browser client (tests, missing env): the poll still runs
    }
    let timer;
    // A burst of writes (a draft, then its label) is one refresh.
    const nudge = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 800);
    };
    // One topic per mount: supabase-js hands back an existing channel with the
    // same name, and adding callbacks to a subscribed channel throws.
    const channel = supabase
      .channel(`needs-you-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' }, nudge)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [load]);

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
