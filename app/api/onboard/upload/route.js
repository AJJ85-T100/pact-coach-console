/**
 * POST /api/onboard/upload
 *
 * Token-gated image upload for the onboarding wizard (the client isn't logged
 * in — the invite token is the credential). Accepts a resized base64 JPEG data
 * URL, stores it in the `gym-photos` Storage bucket, returns the public URL.
 *
 * Requires a public Storage bucket named `gym-photos`.
 * Body: { token: string, image: string (data URL) }
 */

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

    const path = `${token}/${Date.now()}.jpg`;
    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.error('[onboard upload] storage error', upErr);
      return NextResponse.json({ error: 'Could not save the photo. You can skip it for now.' }, { status: 500 });
    }

    const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub?.publicUrl || null });
  } catch (e) {
    console.error('[onboard upload] exception', e);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
