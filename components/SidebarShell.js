'use client';

/**
 * SidebarShell — responsive chrome around the console.
 *
 * Desktop (lg+): the sidebar renders exactly as before — sticky, 256px.
 * Mobile/tablet: the sidebar becomes a slide-in drawer behind a burger in a
 * slim top bar, so the console is actually usable from a phone between
 * sessions. The sidebar content itself stays server-rendered (passed in as
 * a prop) — this component only owns the open/closed state.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function SidebarShell({ sidebar, children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-bg">

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-blue text-white flex items-center justify-between px-4 h-14 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-red text-white grid place-items-center font-display font-black text-sm rounded">P</div>
          <span className="font-display font-extrabold text-sm tracking-wide">
            PACT<span className="text-red">.</span>HEALTH
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2"
        >
          <span className="block w-6 h-0.5 bg-white mb-1.5" />
          <span className="block w-6 h-0.5 bg-white mb-1.5" />
          <span className="block w-6 h-0.5 bg-white" />
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: drawer on mobile, static column on lg+ */}
      <div
        className={`
          fixed lg:sticky top-0 z-50 lg:z-auto h-screen transition-transform duration-200 lg:transition-none
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex-shrink-0
        `}
      >
        {sidebar}
      </div>

      {/* Main content — padded below the mobile top bar */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
