'use client';

/**
 * Connect Claude — a key that lets Claude read this coach's athletes through
 * the engine's /mcp ("how is Sam doing this week?"). Read-only; athletes
 * without AI consent are withheld there. The key is shown once, right after
 * it's made; only a hash is kept. Via /api/settings/mcp-key.
 */
import { useEffect, useState } from 'react';

const MCP_URL = `${(process.env.NEXT_PUBLIC_ENGINE_URL || 'https://pact-engine.alexjjoyner.workers.dev').replace(/\/$/, '')}/mcp`;

function when(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ConnectClaude() {
  const [state, setState] = useState({ status: 'loading' });
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/settings/mcp-key', { cache: 'no-store' });
      if (res.status === 404) return setState({ status: 'off' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ status: 'error' });
      setState({ status: 'ok', connected: !!j.connected, createdAt: j.createdAt, lastUsedAt: j.lastUsedAt });
    } catch {
      setState({ status: 'error' });
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (state.connected && !window.confirm('Make a new key? The old one stops working straight away.')) return;
    setBusy(true); setMsg(null); setKey(null);
    try {
      const res = await fetch('/api/settings/mcp-key', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.key) { setMsg(j.error || 'Couldn’t make a key. Try again in a minute.'); return; }
      setKey(j.key);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm('Disconnect Claude? The key stops working straight away.')) return;
    setBusy(true); setMsg(null); setKey(null);
    try {
      const res = await fetch('/api/settings/mcp-key', { method: 'DELETE' });
      if (!res.ok) setMsg('Couldn’t disconnect. Try again in a minute.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const box = 'bg-white border border-border p-5 text-sm';
  if (state.status === 'loading') return <div className={`${box} text-muted`}>Loading…</div>;
  if (state.status === 'off') return <div className={`${box} text-muted`}>Connecting Claude isn’t switched on yet.</div>;
  if (state.status === 'error') return <div className={`${box} text-muted`}>Couldn’t check the connection just now.</div>;

  const command = key ? `claude mcp add --transport http pact ${MCP_URL} --header "Authorization: Bearer ${key}"` : null;

  return (
    <div className={`${box} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-blue">
            {state.connected ? `Connected · key made ${when(state.createdAt)}${state.lastUsedAt ? `, last used ${when(state.lastUsedAt)}` : ', not used yet'}` : 'Not connected'}
          </p>
          <p className="text-muted mt-1 max-w-xl">
            Ask Claude about your athletes, like “how is Sam doing this week?”, and it answers from live PACT data. Read-only. Athletes who haven’t agreed to AI processing are left out.
          </p>
        </div>
        <div className="flex gap-2">
          {state.connected && (
            <button onClick={revoke} disabled={busy} className="min-h-[44px] px-4 text-[13px] font-semibold border border-border text-muted hover:border-blue hover:text-blue disabled:opacity-50" style={{ borderRadius: 0 }}>
              Disconnect
            </button>
          )}
          <button onClick={create} disabled={busy} className="min-h-[44px] px-4 text-[13px] font-semibold bg-blue text-white hover:bg-blue-light disabled:opacity-50" style={{ borderRadius: 0 }}>
            {busy ? 'Working…' : state.connected ? 'New key' : 'Make a key'}
          </button>
        </div>
      </div>
      {command && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-blue font-semibold">Copy this now: the key won’t be shown again.</p>
          <p className="text-[13px] text-muted">In a terminal on the computer where you use Claude Code, run:</p>
          <pre className="bg-bg border border-border p-3 text-[12px] whitespace-pre-wrap break-all select-all">{command}</pre>
          <button onClick={() => navigator.clipboard?.writeText(command).then(() => setMsg('Copied.'))} className="self-start min-h-[44px] px-4 text-[13px] font-semibold border border-border text-blue hover:border-blue" style={{ borderRadius: 0 }}>
            Copy command
          </button>
        </div>
      )}
      {msg && <p className="text-[13px] text-blue" role="status">{msg}</p>}
    </div>
  );
}
