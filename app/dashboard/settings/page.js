import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import VoiceCalibration from '@/components/VoiceCalibration';
import CalendarConnect from '@/components/CalendarConnect';
import CoachRules from '@/components/CoachRules';
import EscalationAlerts from '@/components/EscalationAlerts';
import BusinessSettings from '@/components/BusinessSettings';
import ConnectClaude from '@/components/ConnectClaude';

/**
 * /dashboard/settings — settings that apply to the whole roster, leading with
 * voice calibration, with jump links so a coach on a phone isn't scrolling
 * one long page. (The PACT V2 on/off switch went in the Oct 2026 tidy-up:
 * every athlete is on the engine and the classic bot is being retired.)
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

  const H2 = 'font-display font-extrabold text-blue text-xl uppercase tracking-tight';
  const LEAD = 'text-muted text-sm mt-1.5 leading-relaxed max-w-xl';
  const SECTIONS = [
    ['voice', 'Voice'], ['rules', 'Rules'], ['alerts', 'Alerts'], ['calendar', 'Calendar'], ['business', 'Business'], ['claude', 'Claude'],
  ];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-2xl">
      <div className="mb-4">
        <h1 className="font-display font-extrabold text-blue text-3xl uppercase tracking-tight">Settings</h1>
        <p className="text-muted text-sm mt-1.5">These apply to every athlete on your roster. Per-athlete targets, focus and fees are on each athlete’s Settings tab.</p>
      </div>
      <nav aria-label="Settings sections" className="sticky top-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 mb-6 bg-bg flex gap-2 overflow-x-auto">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 min-h-[40px] inline-flex items-center px-3 border border-border bg-white text-[14px] font-semibold text-blue hover:border-blue">{label}</a>
        ))}
      </nav>

      <section id="voice" className="scroll-mt-16">
        <h2 className={H2}>Your voice</h2>
        <p className={LEAD}>
          PAX writes to your athletes as an extension of you, between sessions, in your style.
          Teach it how you talk, hear a sample, and save. It applies from the next message.
        </p>
        <div className="mt-4"><VoiceCalibration initial={pt.voice_calibration} /></div>
      </section>

      <section id="rules" className="mt-10 scroll-mt-16">
        <h2 className={H2}>Your rules</h2>
        <p className={LEAD}>When PAX messages, how often, what it never raises, and whether you approve first.</p>
        <div className="mt-4"><CoachRules /></div>
      </section>

      <section id="alerts" className="mt-10 scroll-mt-16">
        <h2 className={H2}>Alerts on your phone</h2>
        <p className={LEAD}>
          When an athlete says something PAX mustn’t handle alone, PAX sends them a holding message and tells you. Get that on your phone, not just on My Day.
        </p>
        <div className="mt-4"><EscalationAlerts /></div>
      </section>

      <section id="calendar" className="mt-10 scroll-mt-16">
        <h2 className={H2}>Your calendar</h2>
        <p className={LEAD}>Sessions you book on an athlete’s Sessions tab go straight into your diary.</p>
        <div className="mt-4"><CalendarConnect /></div>
      </section>

      <section id="business" className="mt-10 scroll-mt-16">
        <h2 className={H2}>Business</h2>
        <p className={LEAD}>Your numbers before PACT, so My Day can show what it keeps. Only you see these.</p>
        <div className="mt-4"><BusinessSettings /></div>
      </section>

      <section id="claude" className="mt-10 scroll-mt-16">
        <h2 className={H2}>Connect Claude</h2>
        <p className={LEAD}>
          Ask Claude about your roster in plain English. It reads the same live data as this console, and never sees what your athletes typed.
        </p>
        <div className="mt-4"><ConnectClaude /></div>
      </section>
    </div>
  );
}
