'use client';

/**
 * /onboard/gym-scan?clientId=<uuid>
 *
 * Photo-based gym equipment scanner. User uploads a photo, we resize it
 * client-side to Claude Vision's recommended 1568px max edge, base64-encode,
 * POST to /api/gym-scan, and display the identified equipment.
 *
 * V0 scope: single photo, no persistence, read-only result display.
 * Next session: multi-photo, edit/confirm, write to clients.equipment_list,
 * feed into Program Builder's equipment-aware exercise filtering.
 */

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.85;

export default function GymScanPage() {
  return (
    <Suspense fallback={<PageShell><div /></PageShell>}>
      <ScanContent />
    </Suspense>
  );
}

function ScanContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId');

  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [equipment, setEquipment] = useState(null);
  const [error, setError] = useState(null);

  if (!clientId) {
    return <MissingInvite />;
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setEquipment(null);
    setError(null);
    setScanning(true);

    try {
      const { base64, mediaType } = await resizeAndEncode(file, MAX_DIMENSION);

      const res = await fetch('/api/gym-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Scan failed. Try again.');
      }

      setEquipment(data.equipment || []);
    } catch (err) {
      setError(err.message);
      setEquipment(null);
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setEquipment(null);
    setError(null);
    setScanning(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <PageShell>
      <Header />

      {!previewUrl && <UploadDropzone fileInputRef={fileInputRef} onSelect={handleFileSelect} />}

      {previewUrl && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-[6px] border border-[#E2E6EB] bg-white">
            <img src={previewUrl} alt="Your gym space" className="w-full h-auto block" />
            {scanning && <ScanOverlay />}
          </div>

          {error && <ErrorBanner message={error} onRetry={reset} />}

          {equipment !== null && !scanning && <EquipmentResult items={equipment} onReset={reset} />}
        </div>
      )}
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Image resize + base64 encode (client-side). Resize to Claude Vision's
// recommended max edge for best results, JPEG-encode with quality compression
// to keep upload payload small.
// ----------------------------------------------------------------------------
async function resizeAndEncode(file, maxDim) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const base64 = dataUrl.split(',')[1];

      URL.revokeObjectURL(objectUrl);
      resolve({ base64, mediaType: 'image/jpeg' });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image. Try another photo.'));
    };

    img.src = objectUrl;
  });
}

// ----------------------------------------------------------------------------
// UI components
// ----------------------------------------------------------------------------

function Header() {
  return (
    <header className="mb-8 sm:mb-10">
      <Logo />

      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-5">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          Scan Your Space
        </span>
      </div>

      <h1 className="font-['Montserrat'] font-extrabold text-3xl sm:text-4xl lg:text-5xl text-[#0A2540] uppercase tracking-tight leading-[0.95] mb-4">
        Show us your<br />gym.
      </h1>

      <p className="font-['Inter'] text-base text-[#4A4A4A] leading-relaxed max-w-xl">
        One photo. PAX will spot the equipment, and your PT will only ever
        prescribe sessions you can actually do with what you've got.
      </p>
    </header>
  );
}

function UploadDropzone({ fileInputRef, onSelect }) {
  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      className="bg-white border-2 border-dashed border-[#E2E6EB] hover:border-[#0A2540] hover:bg-[#EBF1F5] rounded-[6px] p-10 sm:p-14 text-center cursor-pointer transition-colors"
    >
      <div className="w-14 h-14 bg-[#0A2540] rounded-[6px] flex items-center justify-center mx-auto mb-5">
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </div>
      <h3 className="font-['Montserrat'] font-bold text-[#0A2540] text-lg uppercase tracking-tight mb-2">
        Add a photo
      </h3>
      <p className="font-['Inter'] text-[#4A4A4A] text-sm">
        Take a photo or pick from your camera roll
      </p>
      <p className="font-['Inter'] text-[#8A95A3] text-xs mt-3">
        Best results: wide angle, well lit, equipment in frame
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onSelect}
        className="hidden"
      />
    </div>
  );
}

function ScanOverlay() {
  return (
    <>
      <div className="absolute inset-0 bg-[#0A2540]/40 backdrop-blur-[2px] flex flex-col items-center justify-center">
        <div className="absolute inset-x-0 h-[3px] bg-[#D92D20] shadow-[0_0_24px_rgba(217,45,32,0.9)] animate-[scan_2s_ease-in-out_infinite]" />
        <div className="relative z-10 bg-[#0A2540] px-5 py-3 rounded-[4px]">
          <span className="font-['Inter'] font-semibold text-white text-[12px] uppercase tracking-[2.5px]">
            Scanning your gym...
          </span>
        </div>
      </div>
      <style>{`
        @keyframes scan {
          0%, 100% { top: 8%; }
          50% { top: 88%; }
        }
      `}</style>
    </>
  );
}

function EquipmentResult({ items, onReset }) {
  return (
    <div className="bg-white rounded-[6px] p-6 sm:p-8 shadow-[0_4px_10px_rgba(10,37,64,0.05)] border border-[#E2E6EB]">
      <div className="inline-block pt-2 border-t-2 border-[#D92D20] mb-4">
        <span className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[2.5px]">
          {items.length > 0 ? 'Equipment found' : 'Hmm'}
        </span>
      </div>

      {items.length > 0 ? (
        <>
          <h2 className="font-['Montserrat'] font-extrabold text-2xl sm:text-3xl text-[#0A2540] uppercase tracking-tight leading-[1.05] mb-5">
            {items.length} {items.length === 1 ? 'item' : 'items'} spotted.
          </h2>

          <ul className="space-y-2 mb-6">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 bg-[#F4F6F8] rounded-[4px] pl-4 pr-3 py-3 border-l-[3px] border-[#0A2540]"
              >
                <span className="flex-1 font-['Inter'] font-medium text-[#0A2540] text-sm leading-snug">
                  {item.name}
                </span>
                {item.quantity > 1 && (
                  <span className="font-['Inter'] font-bold text-[#0A2540] text-xs bg-white rounded-[4px] px-2 py-1 border border-[#E2E6EB]">
                    ×{item.quantity}
                  </span>
                )}
                <ConfidencePill level={item.confidence} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2 className="font-['Montserrat'] font-extrabold text-2xl sm:text-3xl text-[#0A2540] uppercase tracking-tight leading-[1.05] mb-3">
            Nothing spotted.
          </h2>
          <p className="font-['Inter'] text-[#4A4A4A] text-sm mb-6">
            Try a wider shot with the equipment clearly in frame.
          </p>
        </>
      )}

      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 bg-[#D92D20] hover:bg-[#B0241A] text-white font-['Inter'] font-semibold text-[13px] uppercase tracking-[0.4px] px-6 py-3.5 rounded-[6px] transition-colors"
      >
        Scan another photo
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function ConfidencePill({ level }) {
  const styles = {
    high:   'bg-[#0F8A5F] text-white',
    medium: 'bg-[#E8B43A] text-[#0A2540]',
    low:    'bg-[#8A95A3] text-white',
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-[3px] ${styles[level] || styles.medium}`}>
      {level}
    </span>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="p-4 bg-white border-l-[3px] border-[#D92D20] rounded-[4px] shadow-[0_4px_10px_rgba(10,37,64,0.05)] flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="font-['Montserrat'] font-bold text-[11px] text-[#D92D20] uppercase tracking-[1.5px] mb-1">
          Couldn't scan that one
        </p>
        <p className="font-['Inter'] text-sm text-[#0A2540]">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="font-['Inter'] font-semibold text-[11px] text-[#D92D20] uppercase tracking-[1.5px] hover:text-[#B0241A] transition-colors flex-shrink-0"
      >
        Try again
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared chrome (inlined for now — extract to app/_components/Brand.js next
// session when we have four pages using the same pattern).
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
    <div className="flex items-center gap-2.5 mb-6 sm:mb-8">
      <img src="/pact-mark.png" alt="PACT.Health" className="w-9 h-9" />
      <span className="font-['Montserrat'] font-extrabold text-[#0A2540] text-base tracking-wide">
        PACT<span className="text-[#D92D20]">.</span>HEALTH
      </span>
    </div>
  );
}

function MissingInvite() {
  return (
    <PageShell>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-[6px] p-8 max-w-md w-full text-center shadow-[0_4px_10px_rgba(10,37,64,0.05)]">
          <div className="mb-6 flex justify-center">
            <img src="/pact-mark.png" alt="PACT.Health" className="w-14 h-14" />
          </div>
          <h1 className="font-['Montserrat'] font-extrabold text-2xl text-[#0A2540] uppercase tracking-tight leading-[1.1] mb-3">
            Something's missing.
          </h1>
          <p className="font-['Inter'] text-[#4A4A4A] text-sm leading-relaxed">
            We couldn't find your invite. Try opening this link from the
            message your coach sent you again.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
