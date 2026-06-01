'use client';

/**
 * /onboard/connected?clientId=<uuid>&provider=<TERRA_CODE>
 *
 * Success callback. Terra redirects here after a successful OAuth handshake.
 * The actual data binding (terra_user_id -> clients row) happens via the
 * `auth` webhook fired by Terra to the bot's /terra route, NOT here — so by
 * the time the user lands on this page, they're already linked. This page
 * only confirms the success and tells them what to expect next.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PROVIDERS } from '../../../lib/terra';

export default function ConnectedPage() {
  return (
    <Suspense fallback={<PageShell><div /></PageShell>}>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');
  const providerCode = searchParams.get('provider');
  const providerName = PROVIDERS.find(p => p.id === providerCode)?.name ?? 'your wearable';

  return (
    <PageShell>
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-[6px] p-8 sm:p-10 max-w-md w-full shadow-[0_4px_10px_rgba(10,37,64,0.05)]">
          <Logo />

          <div className="text-center">
            {/* Success mark */}
            <div className="w-14 h-14 bg-[#0A2540] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-4">
              <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
                Connected
              </span>
            </div>

            <h1 className="font-['Montserrat'] font-extrabold text-2xl sm:text-3xl text-[#0A2540] uppercase tracking-tight leading-[1.05] mb-4">
              {providerName} is linked.
            </h1>

            <p className="font-['Inter'] text-[#4A4A4A] text-sm sm:text-base leading-relaxed mb-8">
              PAX is now reading your sleep, recovery, and activity. Your first
              morning brief will use real data the next time your wearable syncs.
            </p>

            {clientId ? (
              <a
                href={`/onboard/connect?clientId=${clientId}`}
                className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-6 py-3.5 rounded-[6px] transition-colors"
              >
                Connect another
                <span aria-hidden="true">→</span>
              </a>
            ) : (
              <p className="font-['Inter'] text-[#8A95A3] text-[13px]">
                You can close this window.
              </p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Shared chrome (inlined here for now — extract to a shared module when we
// have a third page that uses the same pattern, which is next).
// ----------------------------------------------------------------------------

function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-[#F4F6F8] antialiased">
      <div className="max-w-4xl mx-auto px-5 py-8 sm:px-6 sm:py-12">
        {children}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center justify-center gap-2.5 mb-6">
      <img src="/pact-mark.png" alt="PACT.Health" className="w-9 h-9" />
      <span className="font-['Montserrat'] font-extrabold text-[#0A2540] text-base tracking-wide">
        PACT<span className="text-[#D92D20]">.</span>HEALTH
      </span>
    </div>
  );
}
