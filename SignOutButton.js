'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="text-xs font-semibold tracking-[0.18em] uppercase text-white/60 hover:text-white transition-colors"
    >
      Sign out →
    </button>
  );
}
