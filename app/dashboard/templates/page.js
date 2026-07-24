'use client';

/**
 * /dashboard/templates — the coach's programme-template library.
 *
 * Templates are created from any programme via "Save as template" in the
 * editor, and loaded onto an athlete from the New Programme form. This page
 * lists, opens (→ /dashboard/templates/[id] to view/edit) and deletes them.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not load templates.');
      setTemplates(d.templates || []);
      setError(null);
    } catch (e) {
      setError(e.message);
      setTemplates([]);
    }
  }
  useEffect(() => { load(); }, []);

  // Auto-cancel delete confirm
  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  async function remove(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not delete.');
      }
      setConfirmId(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <p className="text-xs font-semibold text-red tracking-[0.2em] uppercase mb-1">Build once, reuse</p>
      <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight mb-1">Templates</h1>
      <p className="text-body text-sm mb-8">
        Your reusable programme blocks. Open one to view or edit the master copy, then load it
        onto an athlete from their <span className="font-semibold">New programme</span> form and tailor from there.
        Template edits apply to future assignments only.
      </p>

      {error && (
        <div className="bg-white border-l-[3px] border-red rounded px-4 py-3 text-sm text-blue mb-6">
          <span className="font-bold">Something went wrong:</span> {error}
        </div>
      )}

      {!templates && <p className="text-body text-sm">Loading…</p>}

      {templates && templates.length === 0 && !error && (
        <div className="bg-white border-2 border-dashed border-border rounded-lg p-10 text-center max-w-xl">
          <h3 className="font-display font-bold text-blue text-base uppercase tracking-tight mb-2">No templates yet</h3>
          <p className="text-body text-sm max-w-sm mx-auto">
            Open any athlete's programme and hit <span className="font-semibold">Save as template</span> —
            it lands here, ready to load onto the next athlete.
          </p>
        </div>
      )}

      {templates && templates.length > 0 && (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="bg-white rounded-lg shadow-card border border-border p-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/templates/${t.id}`}
                  className="font-display font-bold text-blue text-base truncate hover:text-red transition-colors block"
                >
                  {t.name}
                </Link>
                <div className="text-[11px] text-muted tracking-wide mt-1">
                  {t.week_span > 0 && <>{t.week_span} week{t.week_span === 1 ? '' : 's'} of sessions · </>}
                  {t.session_count} session{t.session_count === 1 ? '' : 's'} · {t.exercise_count} exercise{t.exercise_count === 1 ? '' : 's'}
                  {t.weeks && <> · planned length {t.weeks}w</>}
                  {' · '}updated {new Date(t.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
                {t.notes && <p className="text-[12px] text-body mt-1.5 line-clamp-2">{t.notes}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/dashboard/templates/${t.id}`}
                  className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-bg text-blue rounded hover:bg-border transition-colors"
                >
                  View / Edit
                </Link>
                {confirmId === t.id ? (
                  <>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue">Delete?</span>
                    <button
                      onClick={() => remove(t.id)}
                      disabled={busyId === t.id}
                      className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red hover:bg-red-deep disabled:opacity-50 text-white rounded transition-colors"
                    >
                      {busyId === t.id ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-bg text-blue rounded"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(t.id)}
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-red transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
