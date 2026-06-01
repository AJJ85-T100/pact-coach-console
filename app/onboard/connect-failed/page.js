'use client';

/**
 * /onboard/connect-failed?clientId=<uuid>&provider=<TERRA_CODE>
 *
 * Failure callback. Terra redirects here if the user cancelled the OAuth
 * handshake, declined permissions, or the provider returned an error. No
 * terra_user_id has been written; the client row is unchanged.
 *
 * Primary action: send them back to the picker for the same client so they
 * can try again or pick a different provider.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PROVIDERS } from '../../../lib/terra';

export default function ConnectFailedPage() {
  return (
    <Suspense fallback={<PageShell><div /></PageShell>}>
      <FailureContent />
    </Suspense>
  );
}

function FailureContent() {
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
            {/* Failure mark — using Drive Red ring with an X */}
            <div className="w-14 h-14 border-2 border-[#D92D20] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-7 h-7 text-[#D92D20]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-4">
              <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
                Connection issue
              </span>
            </div>

            <h1 className="font-['Montserrat'] font-extrabold text-2xl sm:text-3xl text-[#0A2540] uppercase tracking-tight leading-[1.05] mb-4">
              Didn't go through.
            </h1>

            <p className="font-['Inter'] text-[#4A4A4A] text-sm sm:text-base leading-relaxed mb-8">
              We couldn't link {providerName}. Usually this means the
              authorization was cancelled or your account had a hiccup. Try
              again, or pick a different device.
            </p>

            {clientId ? (
              <a
                href={`/onboard/connect?clientId=${clientId}`}
                className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-6 py-3.5 rounded-[6px] transition-colors"
              >
                Try again
                <span aria-hidden="true">→</span>
              </a>
            ) : (
              <p className="font-['Inter'] text-[#8A95A3] text-[13px]">
                Open the invite link from your coach again to retry.
              </p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Shared chrome (inlined — see /onboard/connected for the matching versions)
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
