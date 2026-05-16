import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================================
// POST /api/invites/create
//
// Body: { client_name?: string, client_phone?: string, expires_in_days?: number }
// Returns: { token, invite_url, expires_at, client_name, client_phone }
// ============================================================
export async function POST(request) {
  try {
    // Auth check
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Look up the PT
    const service = createServiceClient();
    const { data: pt } = await service
      .from('personal_trainers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!pt) {
      return NextResponse.json({ error: 'No PT record found' }, { status: 403 });
    }

    // Parse + sanitise inputs
    const body = await request.json().catch(() => ({}));
    const clientName  = (body.client_name  || '').trim().slice(0, 80) || null;
    const clientPhone = (body.client_phone || '').trim().replace(/\s/g, '').slice(0, 20) || null;
    const expiresInDays = Math.min(Math.max(parseInt(body.expires_in_days || 7, 10), 1), 90);

    // Generate token
    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Insert
    const { data: invite, error } = await service
      .from('invite_tokens')
      .insert({
        pt_id: pt.id,
        token,
        client_name:  clientName,
        client_phone: clientPhone,
        expires_at:   expiresAt.toISOString(),
      })
      .select('id, token, client_name, client_phone, expires_at')
      .single();

    if (error) {
      console.error('Invite create failed:', error);
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // Build the public onboarding URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const inviteUrl = `${siteUrl}/onboard?token=${invite.token}`;

    return NextResponse.json({
      token:        invite.token,
      invite_url:   inviteUrl,
      expires_at:   invite.expires_at,
      client_name:  invite.client_name,
      client_phone: invite.client_phone,
    });

  } catch (e) {
    console.error('Invite create exception:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
