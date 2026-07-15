/**
 * GET /api/onboard/gym-search?token=...&q=...
 *
 * Gym lookup for the client onboarding wizard, backed by Google Places
 * Text Search. Public but token-authorised — the invite token must exist,
 * be unused, and be in date (same credential as /api/onboard/complete),
 * so this can't be used as an open proxy to burn the Places quota.
 *
 * Env: GOOGLE_PLACES_API_KEY. If unset, returns an empty result list and
 * the wizard silently falls back to manual text entry — search is an
 * enhancement, never a dependency.
 *
 * Returns: { results: [{ place_id, name, address }] }
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const EMPTY = NextResponse.json({ results: [] });

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = (url.searchParams.get('token') || '').trim();
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);

    if (!token) return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 });
    if (q.length < 3) return EMPTY;

    // Token gate — same validity rules as onboard/complete, without locking it.
    const service = createServiceClient();
    const { data: invite, error: invErr } = await service
      .from('invite_tokens').select('id, used_at, expires_at').eq('token', token).maybeSingle();
    if (invErr) return NextResponse.json({ error: 'Could not validate the invite.' }, { status: 500 });
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite not valid.' }, { status: 403 });
    }

    // No key configured -> graceful no-op; the wizard's manual entry covers it.
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return EMPTY;

    // Places Text Search (New) — bias to gyms, UK-first.
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery: `${q} gym`,
        includedType: 'gym',
        regionCode: 'GB',
        maxResultCount: 5,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[gym-search] places error', res.status, detail);
      return EMPTY; // degrade, don't break the wizard
    }

    const json = await res.json();
    const results = (json.places || []).map((p) => ({
      place_id: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
    })).filter((r) => r.name);

    return NextResponse.json({ results });
  } catch (e) {
    console.error('[gym-search] exception', e);
    return EMPTY; // degrade, don't break the wizard
  }
}
