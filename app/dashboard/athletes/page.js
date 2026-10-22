/**
 * /dashboard/athletes — the roster: who needs me, why, what do I do.
 *
 * Everything on a card (status and reason, this week's squares, focus,
 * phase-aware weight, flags) comes from the engine as the signed-in coach,
 * so it matches the athlete's app and the Needs you list. See
 * components/roster/RosterBoard.js and the engine's domain/roster.ts.
 */
import { engineFetch } from '@/lib/engine';
import RosterBoard from '@/components/roster/RosterBoard';

export const dynamic = 'force-dynamic';

export default async function AthletesPage() {
  const { status, json } = await engineFetch('/v1/coach/roster-cards');
  const cards = status === 200 && Array.isArray(json?.cards) ? json.cards : null;
  const today = json?.today || new Date().toISOString().slice(0, 10);
  const needs = cards ? cards.filter((c) => c.status === 'need').length : 0;

  return (
    <div className="px-4 sm:px-8 lg:px-10 py-6 lg:py-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-blue text-3xl lg:text-4xl uppercase tracking-tight leading-none">Athletes</h1>
          {cards && (
            <p className="text-sm text-[#5B6B7F] mt-2">
              {cards.length} {cards.length === 1 ? 'athlete' : 'athletes'}
              {needs ? ` · ${needs} need${needs === 1 ? 's' : ''} you` : ' · nobody needs you right now'}
            </p>
          )}
        </div>
        <a href="/dashboard/invite" className="inline-flex items-center min-h-[44px] px-4 bg-red text-white text-sm font-semibold hover:bg-red-deep">
          + Invite athlete
        </a>
      </header>

      {!cards ? (
        <p className="m-0 p-6 bg-white border border-border text-sm text-[#5B6B7F]">
          Couldn&rsquo;t load your athletes from PACT just now. Refresh in a minute.
        </p>
      ) : cards.length === 0 ? (
        <EmptyState />
      ) : (
        <RosterBoard cards={cards} today={today} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white border border-border p-12 text-center mt-6">
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-red mb-3">No athletes yet</p>
      <h3 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-3">Empty roster</h3>
      <p className="text-body text-sm leading-relaxed max-w-md mx-auto">
        Invite your first athlete to get started. The Invite athlete page builds their onboarding link.
      </p>
    </div>
  );
}
