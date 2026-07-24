// POST /api/admin/login  { key }  → sets httpOnly session cookie
// DELETE /api/admin/login          → clears it
import { NextResponse } from 'next/server';
import {
  checkPortalKey, mintSession, sessionCookieOptions, ADMIN_COOKIE,
} from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

// Crude in-memory throttle: 8 attempts / 10 min per runtime instance.
// (Serverless instances recycle, but this still blunts casual brute force;
// the real defence is the 64-char key space.)
let attempts = [];

export async function POST(request) {
  const now = Date.now();
  attempts = attempts.filter((t) => now - t < 10 * 60_000);
  if (attempts.length >= 8) {
    return NextResponse.json({ error: 'Too many attempts. Wait a few minutes.' }, { status: 429 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  if (!checkPortalKey(body.key)) {
    attempts.push(now);
    return NextResponse.json({ error: 'Wrong key' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const opts = sessionCookieOptions();
  res.cookies.set(opts.name, mintSession(), opts);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
