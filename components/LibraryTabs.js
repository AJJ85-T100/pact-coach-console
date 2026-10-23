'use client';

/**
 * Programmes, Templates and the Exercise library share one sidebar item
 * (Programmes); these tabs move between them.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/programs', label: 'Programmes' },
  { href: '/dashboard/templates', label: 'Templates' },
  { href: '/dashboard/exercises', label: 'Exercise library' },
];

export default function LibraryTabs() {
  const path = usePathname() || '';
  return (
    <nav aria-label="Programmes" className="px-4 sm:px-8 lg:px-10 pt-5 flex gap-1 overflow-x-auto border-b border-border bg-bg">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`shrink-0 min-h-[44px] inline-flex items-center px-4 text-[14px] font-semibold border-b-2 -mb-px ${on ? 'border-red text-blue' : 'border-transparent text-[#5B6B7F] hover:text-blue'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
