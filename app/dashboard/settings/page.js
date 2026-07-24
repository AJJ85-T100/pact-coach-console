import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import VoiceCalibration from '@/components/VoiceCalibration';
import CalendarConnect from '@/components/CalendarConnect';

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
        <h2 className="font-display font-extrabold text-blue text-xl uppercase tracking-tight">Your calendar</h2>
        <p className="text-muted text-sm mt-1.5 leading-relaxed max-w-xl">
          Sessions you schedule on the Briefs board can go straight into your diary.
        </p>
      </div>
      <CalendarConnect />
    </div>
  );
}
