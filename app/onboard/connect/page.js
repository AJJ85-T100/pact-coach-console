'use client';

/**
 * /onboard/connect?clientId=<uuid>
 *
 * PACT-branded wearable picker. Mobile-first responsive grid of 14 providers
 * sourced from PROVIDERS (single source of truth in lib/terra). Full-card
 * click pattern for better mobile touch targets. Per-card loading state so
 * other cards become disabled while one connect is in flight.
 *
 * Flow:
 *   user taps card -> POST /api/terra/connect -> receive authUrl -> redirect
 *   to Terra -> Terra hosts OAuth handshake -> Terra fires auth webhook to
 *   bot's /terra (stores terra_user_id) -> Terra redirects user back to
 *   /onboard/connected (success) or /onboard/connect-failed (failure).
 *
 * Standalone for now (test in isolation). Will be wired into the onboarding
 * wizard as a step in a follow-up build.
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PROVIDERS } from '../../../lib/terra';

// ----------------------------------------------------------------------------
// Top-level page export — wraps content in Suspense because useSearchParams
// requires it in Next.js 14 App Router.
// ----------------------------------------------------------------------------
export default function ConnectPage() {
  return (
    <Suspense fallback={<PageShell><div /></PageShell>}>
      <PickerContent />
    </Suspense>
  );
}

// ----------------------------------------------------------------------------
// Picker content
// ----------------------------------------------------------------------------
function PickerContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const [loadingProvider, setLoadingProvider] = useState(null);
  const [error, setError] = useState(null);

  if (!clientId) {
    return <MissingInvite />;
  }

  async function handleConnect(providerId) {
    setLoadingProvider(providerId);
    setError(null);
    try {
      const res = await fetch('/api/terra/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        throw new Error(data.error || 'Connection failed. Try again in a moment.');
      }
      // Hand off to Terra. The user leaves our domain at this point.
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err.message);
      setLoadingProvider(null);
    }
  }

  return (
    <PageShell>
      <Header />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            loading={loadingProvider === p.id}
            disabled={loadingProvider !== null && loadingProvider !== p.id}
            onClick={() => handleConnect(p.id)}
          />
        ))}
      </div>

      <p className="mt-8 text-center font-['Inter'] text-[13px] text-[#8A95A3]">
        You can connect more devices later from your account.
      </p>
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Layout shell — outer container, applied consistently so missing-invite
// state shares the same page chrome as the picker.
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

// ----------------------------------------------------------------------------
// Brand mark — single source of truth for the PACT logo image. Future surfaces
// import from one place; updating the asset file in /public updates everywhere.
// ----------------------------------------------------------------------------
function BrandMark({ className = 'w-8 h-8' }) {
  return (
    <img
      src="/pact-mark.png"
      alt="PACT.Health"
      className={className}
    />
  );
}

// ----------------------------------------------------------------------------
// Header — logo + page title + subtitle
// ----------------------------------------------------------------------------
function Header() {
  return (
    <header className="mb-8 sm:mb-10">
      <Logo />

      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-5">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          Connect Your Data
        </span>
      </div>

      <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#0A2540] uppercase tracking-tight leading-[0.95] mb-4">
        Connect your<br />wearable.
      </h1>

      <p className="font-['Inter'] text-base text-[#4A4A4A] leading-relaxed max-w-xl">
        Pick the device or app you already use. PAX uses your sleep, recovery,
        and activity to make every check-in genuinely useful — not generic.
      </p>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 mb-6 sm:mb-8">
      <BrandMark className="w-9 h-9" />
      <span className="font-['Montserrat'] font-extrabold text-[#0A2540] text-base tracking-wide">
        PACT<span className="text-[#D92D20]">.</span>HEALTH
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Provider card — full-card click target, loading state replaces content
// in-place so layout doesn't shift.
// ----------------------------------------------------------------------------
function ProviderCard({ provider, loading, disabled, onClick }) {
  const firstLetter = provider.name.charAt(0);
  const isInteractive = !disabled && !loading;

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'group relative w-full bg-white rounded-[6px] p-5 text-left',
        'border border-[#E2E6EB]',
        'shadow-[0_4px_10px_rgba(10,37,64,0.05)]',
        'transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isInteractive
          ? 'hover:border-[#0A2540] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_rgba(10,37,64,0.18)] cursor-pointer'
          : '',
      ].join(' ')}
    >
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <div className="w-5 h-5 border-2 border-[#0A2540] border-t-transparent rounded-full animate-spin mr-3" />
          <span className="font-['Inter'] font-semibold text-[#0A2540] text-sm uppercase tracking-wider">
            Connecting...
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-3.5">
          <div className="flex-shrink-0 w-11 h-11 bg-[#0A2540] rounded-[4px] flex items-center justify-center">
            <span className="font-['Montserrat'] font-extrabold text-white text-lg leading-none">
              {firstLetter}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-['Montserrat'] font-bold text-[#0A2540] text-base uppercase tracking-[0.3px] leading-tight mb-1 truncate">
              {provider.name}
            </h3>
            <p className="font-['Inter'] text-[13px] text-[#4A4A4A] leading-snug">
              {provider.tagline}
            </p>
          </div>

          <div className="flex-shrink-0 self-center text-[#D92D20] font-['Inter'] font-bold text-lg leading-none transition-transform group-hover:translate-x-1">
            →
          </div>
        </div>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Error banner — Drive Red left-border, dismissable.
// ----------------------------------------------------------------------------
function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="mb-6 p-4 bg-white border-l-[3px] border-[#D92D20] rounded-[4px] shadow-[0_4px_10px_rgba(10,37,64,0.05)] flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="font-['Montserrat'] font-bold text-[11px] text-[#D92D20] uppercase tracking-[1.5px] mb-1">
          Connection issue
        </p>
        <p className="font-['Inter'] text-sm text-[#0A2540]">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-[#8A95A3] hover:text-[#0A2540] transition-colors text-xl leading-none -mt-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Missing-invite state — graceful fallback if the URL lands here without
// a clientId. Keeps page chrome consistent.
// ----------------------------------------------------------------------------
function MissingInvite() {
  return (
    <PageShell>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-[6px] p-8 max-w-md w-full text-center shadow-[0_4px_10px_rgba(10,37,64,0.05)]">
          <div className="mb-6 flex justify-center">
            <BrandMark className="w-14 h-14" />
          </div>
          <h1 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-[1.1] mb-3">
            Something's missing.
          </h1>
          <p className="font-['Inter'] text-[#4A4A4A] text-sm leading-relaxed">
            We couldn't find your invite. Try opening this link from the message
            your coach sent you again.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
