/** @type {import('next').NextConfig} */

// Security headers (review M7). There were none: no CSP, no clickjacking
// protection on /admin — which hosts the kill switch — and no HSTS beyond
// Vercel's default. That matters more than usual here because the coach's
// Supabase session cookie is written by the browser client and is readable
// by JavaScript, so any XSS is a full session takeover.
//
// The CSP is deliberately conservative: 'unsafe-inline' for scripts is
// required by Next's inline bootstrap, so this is not an XSS silver bullet.
// It still blocks the exfiltration half of most attacks (connect-src),
// framing, and plugin/base-tag tricks. React's escaping remains the primary
// XSS defence in this app.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  // Where the browser may talk to: Supabase, and the bot for calendar status.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.up.railway.app",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Also reduces the client-UUID leakage that made several IDOR findings
  // easy to exploit — UUIDs stop riding outbound Referer headers.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
