/**
 * POST /api/onboard/upload
 *
 * Token-gated image upload for the onboarding wizard (the client isn't logged
 * in — the invite token is the credential). Accepts a resized base64 JPEG data
 * URL, stores it in the `gym-photos` Storage bucket, returns the public URL.
 *
 * ⚠️ SECURITY (review M4). This bucket was PUBLIC and the object key was
 * `${token}/${Date.now()}.jpg` — so photos of athletes' homes and gyms sat
 * at permanent unauthenticated URLs, with the onboarding credential itself
 * embedded in the path. Anyone who saw a photo URL (a forwarded email, a
 * referrer, a log line) held that athlete's invite token.
 *
 * Now: random object key, magic-byte check on the content, and a signed URL
 * with a bounded lifetime. Make the bucket PRIVATE in the Supabase dashboard
 * (Storage → gym-photos → make private) — the code no longer needs it public,
 * and it falls back to a public URL only if signing fails, so flipping it is
 * safe to do before or after this deploys.
 *
 * Body: { token: string, image: string (data URL) }
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'gym-photos';

export async function POST(request) {
  try {
    const { token, image } = await request.json().catch(() => ({}));
    if (!token || !image) return NextResponse.json({ error: 'Missing token or image.' }, { status: 400 });

    const service = createServiceClient();

    const { data: invite } = await service
      .from('invite_tokens').select('id, expires_at, used_at').eq('token', token).maybeSingle();
    if (!invite) return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ error: 'This invite has already been used.' }, { status: 409 });
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invite has expired.' }, { status: 410 });

    const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(image);
    if (!m) return NextResponse.json({ error: 'Invalid image data.' }, { status: 400 });
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > 6 * 1024 * 1024) return NextResponse.json({ error: 'Image is too large — try again.' }, { status: 413 });

    // The data-URL prefix is attacker-supplied; check the actual bytes.
    // Previously any content was accepted and then stored as image/jpeg.
    const sniff = (b) => {
      if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
      if (b.length > 8 && b.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
      if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
      return null;
    };
    const contentType = sniff(buffer);
    if (!contentType) return NextResponse.json({ error: 'That file is not a JPEG, PNG or WebP image.' }, { status: 400 });

    // Random key — the invite token must never appear in an object path.
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${invite.id}/${randomUUID()}.${ext}`;
    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr) {
      console.error('[onboard upload] storage error', upErr);
      return NextResponse.json({ error: 'Could not save the photo. You can skip it for now.' }, { status: 500 });
    }

    // Signed URL (30 days — the coach opens this from an onboarding email,
    // which they may not read the same day). Falls back to a public URL if
    // the bucket is still public, so this deploys safely either way.
    const { data: signed } = await service.storage
      .from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
    if (signed?.signedUrl) return NextResponse.json({ url: signed.signedUrl });

    const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub?.publicUrl || null });
  } catch (e) {
    console.error('[onboard upload] exception', e);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
