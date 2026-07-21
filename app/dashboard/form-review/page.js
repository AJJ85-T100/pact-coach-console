'use client';

// /dashboard/form-review — watch athlete form clips, reply with a note.

import { useEffect, useState, useCallback } from 'react';

export default function FormReviewPage() {
  const [clips, setClips] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    const d = await fetch('/api/form-review', { cache: 'no-store' }).then((r) => r.json());
    setClips(d.clips || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function review(id) {
    await fetch('/api/form-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, coach_note: notes[id] || '' }),
    });
    load();
  }

  const pending  = (clips || []).filter((c) => c.status === 'pending');
  const reviewed = (clips || []).filter((c) => c.status !== 'pending');

  return (
    <div className="p-8 max-w-4xl">
      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Form check</p>
      <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-1">Form review</h1>
      <p className="text-body text-sm mb-8">Clips athletes send from the workout logger. Watch, reply, done.</p>

      {!clips && <p className="text-body text-sm">Loading…</p>}
      {clips && pending.length === 0 && <p className="text-body text-sm mb-8">Queue&apos;s clear — nothing waiting for review. 🎉</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {pending.map((c) => (
          <div key={c.id} className="bg-white rounded-lg shadow-card p-5">
            <div className="font-display font-bold text-blue text-sm uppercase tracking-wide">{c.client}</div>
            <div className="text-body text-sm mb-3">{c.exercise || 'Exercise'} · {new Date(c.at).toLocaleDateString('en-GB')}</div>
            {c.url
              ? <video src={c.url} controls playsInline className="w-full rounded bg-blue mb-3" />
              : <p className="text-red text-xs mb-3">Clip unavailable.</p>}
            <textarea rows={2} maxLength={500} placeholder="Depth looks good — brace harder at the bottom."
              value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-blue text-sm mb-3" />
            <button onClick={() => review(c.id)}
              className="w-full bg-red text-white font-semibold uppercase tracking-wider text-xs py-2.5 rounded hover:bg-red-deep">
              Mark reviewed →
            </button>
          </div>
        ))}
      </div>

      {reviewed.length > 0 && (
        <>
          <h2 className="font-display font-bold text-blue text-sm uppercase tracking-wide mt-10 mb-3">Recently reviewed</h2>
          <div className="bg-white rounded-lg shadow-card divide-y divide-border">
            {reviewed.slice(0, 10).map((c) => (
              <div key={c.id} className="px-5 py-3 text-sm text-body">
                <span className="font-semibold text-blue">{c.client}</span> — {c.exercise || 'Exercise'}
                {c.note ? <span className="text-muted"> · “{c.note}”</span> : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
