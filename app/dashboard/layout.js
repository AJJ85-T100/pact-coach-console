import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';
import SidebarNavItem from '@/components/SidebarNavItem';

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

  // Counts for sidebar badges
  const { data: clients = [] } = await service
    .from('clients')
    .select('id, status')
    .eq('pt_id', pt?.id || null);

  const totalClients = clients?.length || 0;
  const atRiskCount  = (clients || []).filter(c => c.status === 'at_risk').length;

  return (
    <div className="flex min-h-screen bg-bg">

      {/* Sidebar */}
      <aside className="w-64 bg-blue text-white flex flex-col flex-shrink-0 sticky top-0 h-screen">

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

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto">

          {/* Workspace section */}
          <div className="mb-7">
            <div className="px-3 mb-2 text-[10px] font-bold tracking-[0.22em] uppercase text-white/40">
              Workspace
            </div>
            <SidebarNavItem href="/dashboard" label="Dashboard" exact />
            <SidebarNavItem href="/dashboard/athletes" label="Athletes" count={totalClients} />
            <SidebarNavItem href="/dashboard/invite" label="Invite client" />
            <SidebarNavItem href="/dashboard/programs" label="Programs" />
            <SidebarNavItem label="Templates" disabled />
          </div>

          {/* This Week section */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-[0.22em] uppercase text-white/40">
              This Week
            </div>
            <SidebarNavItem label="At-risk clients" count={atRiskCount} badge={atRiskCount > 0} disabled />
            <SidebarNavItem label="PAX reports" disabled />
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

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
