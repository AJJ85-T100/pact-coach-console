import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';
import SidebarNavItem from '@/components/SidebarNavItem';
import SidebarShell from '@/components/SidebarShell';
import { rosterCards, statusCounts } from '@/lib/athlete/status';

export default async function DashboardLayout({ children }) {
  // Belt-and-braces: middleware bounces unauthenticated, but server components
  // shouldn't trust that.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch the coach's PT row
  const service = createServiceClient();
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, business_name, email')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Sidebar badges. "Needs you" is the engine's roster status, the same
  // number the Athletes page shows (lib/athlete/status.js). Form review only
  // appears while clips are waiting for a reply.
  const [roster, pendingClips] = await Promise.all([
    pt?.id ? rosterCards() : null,
    pt?.id
      ? service.from('clients').select('id').eq('pt_id', pt.id).then(async ({ data: ids }) => {
          const list = (ids || []).map((c) => c.id);
          if (!list.length) return 0;
          const { count } = await service.from('form_clips').select('id', { count: 'exact', head: true })
            .in('client_id', list).neq('review_status', 'reviewed');
          return count || 0;
        })
      : 0,
  ]);
  const counts = statusCounts(roster?.cards);
  const totalClients = roster?.cards?.length ?? null;
  const needsYou = counts.need + counts.drift;

  const sidebar = (
      <aside className="w-64 bg-blue text-white flex flex-col h-full">

        {/* Brand */}
        <div className="px-6 py-5 border-b border-white/10">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red text-white grid place-items-center font-display font-black text-lg rounded">
              P
            </div>
            <div>
              <div className="font-display font-extrabold text-white text-sm tracking-wide leading-none">
                PACT<span className="text-red">.</span>HEALTH
              </div>
              <div className="text-[9px] font-semibold text-white/50 tracking-[0.18em] uppercase mt-1">
                Coach Console
              </div>
            </div>
          </Link>
        </div>

        {/* Nav: five places. Everything else lives on the athlete page. */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          <SidebarNavItem href="/dashboard" label="My Day" exact count={needsYou || undefined} badge={counts.need > 0} />
          <SidebarNavItem href="/dashboard/athletes" label="Athletes" also={['/dashboard/clients', '/dashboard/invite']} count={totalClients ?? undefined} />
          <SidebarNavItem href="/dashboard/programs" label="Programmes" also={['/dashboard/templates', '/dashboard/exercises']} />
          {pendingClips > 0 && (
            <SidebarNavItem href="/dashboard/form-review" label="Form review" count={pendingClips} badge />
          )}
          <SidebarNavItem href="/dashboard/settings" label="Settings" />
          <div className="mt-6 px-3">
            <Link href="/dashboard/invite" className="flex items-center justify-center min-h-[44px] bg-red text-white text-sm font-semibold rounded hover:bg-red-deep">
              + Invite athlete
            </Link>
          </div>
        </nav>

        {/* Footer: signed in as + sign out */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="text-[10px] font-semibold text-white/40 tracking-[0.18em] uppercase mb-1">
            Signed in as
          </div>
          <div className="text-sm font-semibold text-white mb-3 truncate">
            {pt?.name || user.email}
          </div>
          <SignOutButton />
        </div>
      </aside>
  );

  return (
    <SidebarShell sidebar={sidebar}>
      {children}
    </SidebarShell>
  );
}
