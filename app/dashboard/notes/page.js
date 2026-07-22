'use client';

// /dashboard/notes — write short notes to an athlete; the athlete app's
// "Notes from your coach" card shows the latest ones.

import { useEffect, useState, useCallback } from 'react';

export default function NotesPage() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [state, setState] = useState('idle');

  useEffect(() => {
    fetch('/api/notes').then((r) => r.json()).then((d) => {
      setClients(d.clients || []);
      if (d.clients?.length) setClientId(d.clients[0].id);
    });
  }, []);

  const loadNotes = useCallback(async (id) => {
    if (!id) return;
    const d = await fetch(`/api/notes?clientId=${id}`).then((r) => r.json());
    setNotes(d.notes || []);
  }, []);

  useEffect(() => { loadNotes(clientId); }, [clientId, loadNotes]);

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setState('sending');
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, body, urgent }),
    });
    setState('idle');
    if (res.ok) { setBody(''); setUrgent(false); loadNotes(clientId); }
  }

  return (
    <div className="p-8 max-w-3xl">
      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Between sessions</p>
      <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-1">Athlete notes</h1>
      <p className="text-body text-sm mb-8">Short and human — these land on the athlete&apos;s dashboard as &quot;Notes from your coach&quot;.</p>

      <form onSubmit={send} className="bg-white rounded-lg shadow-card p-6 mb-8">
        <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Athlete</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="w-full px-4 py-3 bg-bg border border-border rounded text-blue mb-4">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label className="block text-[10px] font-bold tracking-[0.15em] uppercase text-blue mb-2">Note</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000}
          placeholder="Watch the weekend — two social events logged. Front-load protein Saturday."
          className="w-full px-4 py-3 bg-bg border border-border rounded text-blue mb-4" />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Flag as urgent
          </label>
          <button type="submit" disabled={state === 'sending' || !body.trim()}
            className="bg-red text-white font-semibold uppercase tracking-wider text-xs py-3 px-6 rounded hover:bg-red-deep disabled:opacity-60">
            {state === 'sending' ? 'Sending…' : 'Send note →'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow-card divide-y divide-border">
        {notes.length === 0 && <p className="p-5 text-body text-sm">No notes for this athlete yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="px-5 py-4">
            <div className="text-sm text-body leading-relaxed">
              {n.urgent && <span className="text-red font-bold text-[10px] uppercase tracking-wider mr-2">Urgent</span>}
              {n.body}
            </div>
            <div className="text-[11px] text-muted mt-1">{new Date(n.created_at).toLocaleString('en-GB')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
