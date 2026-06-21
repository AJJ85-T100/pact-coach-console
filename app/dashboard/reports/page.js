import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import ReportsBoard from '@/components/ReportsBoard';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  noStore();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();

  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const { data: clients } = await service
    .from('clients')
    .select('*')
    .eq('pt_id', pt?.id || null)
    .order('name', { ascending: true });

  return <ReportsBoard clients={clients || []} ptName={pt?.name || ''} />;
}
