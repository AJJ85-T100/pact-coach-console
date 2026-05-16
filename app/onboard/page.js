import { createServiceClient } from '@/lib/supabase/server';
import Wizard from './Wizard';

// ============================================================
// /onboard?token=xxx
//
// Public route — no Supabase auth required.
// Server-validates the token before rendering the wizard.
// ============================================================
export default async function OnboardPage({ searchParams }) {
  const token = searchParams?.token?.trim();

  if (!token) {
    return <InvalidLink reason="No invite token in the link." />;
  }

  const service = createServiceClient();

  // Look up the invite
  const { data: invite } = await service
    .from('invite_tokens')
    .select('id, pt_id, token, client_name, client_phone, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) {
    return <InvalidLink reason="This invite link doesn't exist or has been revoked." />;
  }

  if (invite.used_at) {
    return <InvalidLink reason="This invite has already been used. Ask your coach for a fresh link if you need to re-onboard." />;
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <InvalidLink reason="This invite link has expired. Ask your coach for a new one." />;
  }

  // Fetch coach info so the wizard can greet them properly
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, business_name, brand_primary_colour')
    .eq('id', invite.pt_id)
    .maybeSingle();

  return (
    <Wizard
      token={token}
      pt={pt || { name: 'your coach', business_name: null }}
      prefill={{
        name:  invite.client_name  || '',
        phone: invite.client_phone || '',
      }}
    />
  );
}

// ============================================================
// Invalid / expired link state
// ============================================================
function InvalidLink({ reason }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-card border border-border max-w-md w-full p-8 text-center">
        <div className="w-12 h-12 bg-red text-white rounded grid place-items-center font-display font-black text-xl mx-auto mb-5">
          !
        </div>
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-red mb-3">
          Link issue
        </p>
        <h1 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-4">
          Invite not valid
        </h1>
        <p className="text-sm text-body leading-relaxed">
          {reason}
        </p>
      </div>
    </div>
  );
}
