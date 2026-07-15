import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import PactsPanel from '@/components/PactsPanel';

/**
 * /dashboard/athletes/[id]/pacts
 *
 * The coach's pact authoring surface for one client — the standing weekly
 * wins PAX enforces daily. Server component resolves + authorises the coach
 * (same chain as the dashboard layout); the panel does the live work.
 */
export default async function ClientPactsPage({ params }) {
  const { id } = params;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();
  const { data: pt } = await service
    .from('personal_trainers').select('id, name').eq('auth_user_id', user.id).maybeSingle();
  if (!pt) redirect('/login');

  const { data: client } = await service
    .from('clients').select('id, name, pt_id, goal, status').eq('id', id).maybeSingle();
  if (!client || client.pt_id !== pt.id) redirect('/dashboard/athletes');

  const firstName = (client.name || '').split(' ')[0];

  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/dashboard/athletes" className="text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-blue transition-colors">
          ← Athletes
        </Link>
        <h1 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mt-2">
          {client.name} · Pacts
        </h1>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          The standing weekly wins you hold {firstName} to. PAX builds each morning&apos;s pact from these,
          scores them from real data through the day, and stacks the wins — this is where the accountability lives.
        </p>
      </div>

      <PactsPanel clientId={client.id} />

      <p className="text-[11px] text-muted mt-4 leading-relaxed">
        Data-backed pacts (steps, protein, sleep, sessions) are scored automatically. Custom pacts are
        PAX-asked — it checks in during the evening wrap and stacks the honest answer.
      </p>
    </div>
  );
}
