import { createServiceClient } from '@/lib/supabase/server';
import OnboardWizard from '@/components/OnboardWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardPage({ searchParams }) {
  const sp = await searchParams;
  const token = (sp?.token || '').toString();

  const service = createServiceClient();

  let status = 'invalid';
  let invite = null;
  let coachName = 'your coach';

  if (token) {
    const { data } = await service
      .from('invite_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (data) {
      invite = data;
      if (data.used_at) status = 'used';
      else if (new Date(data.expires_at) < new Date()) status = 'expired';
      else status = 'ok';
    }
  }

  if (status === 'ok') {
    const { data: pt } = await service
      .from('personal_trainers')
      .select('name, business_name')
      .eq('id', invite.pt_id)
      .maybeSingle();
    coachName = pt?.business_name || pt?.name || 'your coach';

    return (
      <OnboardWizard
        token={token}
        coachName={coachName}
        clientName={invite.client_name || ''}
        clientPhone={invite.client_phone || ''}
      />
    );
  }

  return <InvalidState status={status} />;
}

function InvalidState({ status }) {
  const copy = {
    invalid: {
      head: 'Link not found',
      body: "This onboarding link doesn't look right. Ask your coach to send you a fresh one.",
    },
    expired: {
      head: 'Link expired',
      body: 'This invite has expired. Drop your coach a message and they can generate a new link in seconds.',
    },
    used: {
      head: "You're already set up",
      body: 'This link has already been used. If that wasn’t you, let your coach know — otherwise you’re all good.',
    },
  }[status] || {};

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-12">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-8 h-8 bg-red text-white grid place-items-center font-display font-black text-base rounded">P</div>
        <div className="font-display font-extrabold text-blue text-lg tracking-wide">PACT<span className="text-red">.</span>HEALTH</div>
      </div>
      <div className="bg-white rounded-lg shadow-card border border-border p-8 max-w-md w-full text-center">
        <h1 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight mb-3">{copy.head}</h1>
        <p className="text-body text-sm leading-relaxed">{copy.body}</p>
      </div>
    </div>
  );
}
