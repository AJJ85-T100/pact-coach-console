import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import VoiceCalibration from '@/components/VoiceCalibration';
import CalendarConnect from '@/components/CalendarConnect';
import CoachRules from '@/components/CoachRules';
import V2Roster from '@/components/V2Roster';
import EscalationAlerts from '@/components/EscalationAlerts';
import BusinessSettings from '@/components/BusinessSettings';

/**
 * /dashboard/settings — coach settings, leading with voice calibration.
 * "Would your clients believe it's you?" — this page is where that's won.
 */
export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceClient();
  const { data: pt } = await service
    .from('personal_trainers')
    .select('id, name, voice_calibration')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!pt) redirect('/login');

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-blue text-2xl uppercase tracking-tight">Your voice</h1>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          PAX speaks to your clients as an extension of you — between your sessions, in your style.
          Teach it how you talk, hear a sample, and save. It applies to every message from the next one sent.
        </p>
      </div>
      <VoiceCalibration initial={pt.voice_calibration} />

      <div className="mt-10 mb-4">
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">Your rules</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          The boundaries PAX works inside: when it messages, how often, what it never raises, and whether you approve first.
        </p>
      </div>
      <CoachRules />

      <div className="mt-10 mb-4" id="alerts">
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">Escalation alerts</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          When an athlete says something PAX mustn’t handle alone, it sends them a holding message and tells you. Get that on your phone, not just on Today.
        </p>
      </div>
      <EscalationAlerts />

      <div className="mt-10 mb-4" id="business">
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">Business</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          Your numbers before PACT, so Today can show what it keeps. Only you see these.
        </p>
      </div>
      <BusinessSettings />

      <div className="mt-10 mb-4">
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">PACT V2 athletes</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          Switch an athlete on and PACT V2 writes their daily messages from their wearables and plan, and answers their replies. Off, and the classic bot carries on as before.
          Athletes need to have consented first; send them the link from Needs you today.
        </p>
      </div>
      <V2Roster />

      <div className="mt-10 mb-4">
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">Your calendar</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          Sessions you schedule on the Briefs board can go straight into your diary.
        </p>
      </div>
      <CalendarConnect />
    </div>
  );
}
