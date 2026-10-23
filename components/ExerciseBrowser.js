'use client';

import { useState, useMemo } from 'react';

const thumbOf = (url) => (url ? url.replace('.card.webp', '.thumb.webp') : null);

export default function ExerciseBrowser({ exercises, cards }) {
  const [term, setTerm] = useState('');
  const [pattern, setPattern] = useState(null);
  const [open, setOpen] = useState(null);

  const patterns = useMemo(
    () => [...new Set(exercises.map((e) => e.movement_pattern).filter(Boolean))].sort(),
    [exercises]
  );

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (!pattern || e.movement_pattern === pattern) &&
        (!q || `${e.name} ${e.primary_muscle_label || ''}`.toLowerCase().includes(q))
    );
  }, [exercises, term, pattern]);

  const withArt = visible.filter((e) => cards[e.id]).length;

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display font-extrabold text-2xl text-blue">Exercise library</h1>
        <p className="text-sm text-gray-500 mt-1">
          {visible.length} movement{visible.length === 1 ? '' : 's'} · {withArt} with a demo
        </p>
      </div>

      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search movements"
        aria-label="Search movements"
        className="w-full px-3 py-2 border border-gray-200 rounded text-sm mb-3
                   focus:outline-none focus:ring-2 focus:ring-red/40"
      />

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
        {['All', ...patterns].map((p) => {
          const on = p === 'All' ? !pattern : pattern === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPattern(p === 'All' ? null : p)}
              aria-pressed={on}
              className={`shrink-0 px-3 py-1.5 rounded text-[11px] font-semibold uppercase
                          tracking-wider border transition-colors ${
                            on
                              ? 'bg-blue text-white border-blue'
                              : 'bg-white text-gray-500 border-gray-200 hover:text-blue'
                          }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500">
          Nothing matches that. Try a different word.
        </p>
      ) : (
        <div className="grid gap-px bg-gray-200 border-t border-gray-200
                        grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {visible.map((e) => {
            const c = cards[e.id];
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setOpen(e)}
                className="flex flex-col bg-white text-left hover:bg-gray-50 transition-colors"
              >
                <div className="relative w-full pt-[100%] bg-[#F4F6F8]">
                  {c ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbOf(c.image_url)}
                      alt={c.alt_text}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 grid place-items-center px-2 text-center
                                 text-[10px] uppercase tracking-wider text-gray-400"
                    >
                      Demo coming soon
                    </span>
                  )}
                </div>
                <div
                  className={`mt-auto px-3 pt-2 pb-3 border-t-[3px] ${
                    e.tier === 1 ? 'border-red' : 'border-transparent'
                  }`}
                >
                  <div className="text-[13px] font-semibold text-blue leading-tight break-words">
                    {e.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">
                    {e.primary_muscle_label || (e.equipment || []).join(' · ') || '—'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-blue/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={open.name}
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded overflow-hidden"
            onClick={(ev) => ev.stopPropagation()}
          >
            {cards[open.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cards[open.id].image_url}
                alt={cards[open.id].alt_text}
                className="w-full aspect-square object-contain bg-[#F4F6F8]"
              />
            )}
            <div className="p-4">
              <h2 className="font-display font-extrabold text-lg text-blue">{open.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {cards[open.id]
                  ? cards[open.id].alt_text
                  : 'No demo yet for this movement. You can still prescribe it.'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {open.tier === 1 && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 bg-red text-white rounded">
                    Tier 1
                  </span>
                )}
                {[open.primary_muscle_label, ...(open.equipment || []), open.movement_pattern]
                  .filter(Boolean)
                  .map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 bg-gray-100 text-gray-500 rounded"
                    >
                      {t}
                    </span>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="mt-5 w-full py-2.5 bg-blue text-white rounded text-xs font-semibold uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
