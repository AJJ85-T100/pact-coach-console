'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sidebar nav item with auto-detected active state.
 *
 *   - href:     where it goes (omit for placeholders/disabled)
 *   - label:    visible text
 *   - count:    optional small badge with a number
 *   - badge:    if true, badge renders red (use for at-risk count)
 *   - disabled: render as muted/non-clickable
 *   - exact:    if true, only highlight on exact path match (default for /dashboard
 *               so it doesn't stay highlighted under /dashboard/athletes etc.)
 */
export default function SidebarNavItem({ href, label, count, badge, disabled, exact }) {
  const pathname = usePathname();

  const active = !disabled && href && (
    exact ? pathname === href : (pathname === href || pathname.startsWith(href + '/'))
  );

  const className = `flex items-center justify-between px-3 py-2 rounded text-sm font-medium transition-colors mb-0.5 ${
    active
      ? 'bg-white/10 text-white'
      : disabled
        ? 'text-white/30 cursor-default'
        : 'text-white/75 hover:text-white hover:bg-white/5'
  }`;

  const content = (
    <>
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          badge ? 'bg-red text-white' : 'bg-white/10 text-white/60'
        }`}>
          {count}
        </span>
      )}
    </>
  );

  if (disabled || !href) {
    return <div className={className}>{content}</div>;
  }
  return <Link href={href} className={className}>{content}</Link>;
}
