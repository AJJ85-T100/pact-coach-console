// lib/admin/auth.js
// Single-admin portal auth. One long secret (ADMIN_PORTAL_SECRET, ≥48 chars)
// known only to Alex. Login exchanges it for a signed httpOnly cookie; every
// /api/admin/* route verifies the cookie. No Supabase auth dependency, no
// secret in any URL.
//
// Env (Vercel):
//   ADMIN_PORTAL_SECRET  — generate with: openssl rand -hex 32
//
// Post-pilot upgrade path: replace this with a check that the Supabase session
// user's email is in an ADMIN_EMAILS allowlist, reusing the coach magic-link
// flow. For a one-person pilot this secret is simpler and equally scoped.

import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE = 'pact_admin_session';
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.ADMIN_PORTAL_SECRET;
  if (!s || s.length < 32) return null; // refuse to run mis-configured
  return s;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // still burn comparable time
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Called by /api/admin/login with the raw key the admin typed. */
export function checkPortalKey(candidate) {
  const s = secret();
  if (!s) return false;
  return timingSafeEqual(candidate || '', s);
}

/** Mint the session cookie value: expiry|hmac(expiry). */
export function mintSession() {
  const exp = String(Date.now() + SESSION_HOURS * 3600_000);
  return `${exp}.${sign(exp)}`;
}

export function sessionCookieOptions() {
  return {
    name: COOKIE,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  };
}

export const ADMIN_COOKIE = COOKIE;

/**
 * Guard for every /api/admin/* route.
 * Returns { ok:true } or { ok:false, status, error }.
 */
export function requireAdmin() {
  if (!secret()) {
    return { ok: false, status: 500, error: 'Admin portal not configured' };
  }
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return { ok: false, status: 401, error: 'Not signed in' };

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return { ok: false, status: 401, error: 'Not signed in' };
  const exp = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);

  if (!timingSafeEqual(mac, sign(exp))) {
    return { ok: false, status: 401, error: 'Not signed in' };
  }
  if (Number(exp) < Date.now()) {
    return { ok: false, status: 401, error: 'Session expired' };
  }
  return { ok: true };
}
