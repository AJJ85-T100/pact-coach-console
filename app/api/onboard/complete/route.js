import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ============================================================
// POST /api/onboard/complete
//
// Public — no Supabase auth. Authorisation comes from the
// invite token, which is single-use and time-bound.
//
// Body: { token, data: {...wizard fields} }
// Returns: { client_id, success: true }
// ============================================================
export async function POST(request) {
  try {
    const { token, data } = await request.json().catch(() => ({}));

    if (!token || !data) {
      return NextResponse.json({ error: 'Missing token or data' }, { status: 400 });
    }

    const service = createServiceClient();

    // Re-validate token (concurrency safety — another request might have used it)
    const { data: invite } = await service
      .from('invite_tokens')
      .select('id, pt_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();

    if (!invite)             return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
    if (invite.used_at)      return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
    }

    // ============================================================
    // Build client row
    // ============================================================
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const txt = (v) => {
      const s = (v || '').toString().trim();
      return s.length ? s : null;
    };

    const current = num(data.current_weight);

    const clientRow = {
      pt_id:            invite.pt_id,
      name:             txt(data.name),
      whatsapp_phone:   txt(data.phone),
      goal:             txt(data.goal),
      current_weight:   current,
      start_weight:     current,        // start = current at onboarding
      target_weight:    num(data.target_weight),
      start_date:       new Date().toISOString().slice(0, 10),
      target_date:      txt(data.target_date),
      event_name:       data.has_event ? txt(data.event_name) : null,
      event_date:       data.has_event ? txt(data.event_date) : null,
      experience_level: txt(data.experience_level),
      training_style:   txt(data.training_style),
      training_days:    Array.isArray(data.training_days) && data.training_days.length
                          ? data.training_days
                          : null,
      training_time:    txt(data.training_time),
      gym:              txt(data.gym),
      injuries:         txt(data.injuries),
      squat_max:        num(data.squat_max),
      bench_press_max:  num(data.bench_press_max),
      deadlift_max:     num(data.deadlift_max),
      ohp_max:          num(data.ohp_max),
      onboarding_complete: true,
      onboarding_step:  6,
      status:           'active',
      last_seen_at:     new Date().toISOString(),
    };

    const { data: client, error: insertError } = await service
      .from('clients')
      .insert(clientRow)
      .select('id, name')
      .single();

    if (insertError) {
      console.error('Client insert failed:', insertError);
      return NextResponse.json({ error: 'Could not create client record' }, { status: 500 });
    }

    // ============================================================
    // Store the "what does success look like" answer in memory
    // so PAX can reference it later
    // ============================================================
    if (data.goal_motivation && data.goal_motivation.trim()) {
      await service
        .from('client_memory')
        .insert({
          client_id: client.id,
          key:   'success_definition',
          value: data.goal_motivation.trim(),
        });
    }

    // ============================================================
    // Mark invite as used
    // ============================================================
    const { error: tokenError } = await service
      .from('invite_tokens')
      .update({
        used_at:            new Date().toISOString(),
        used_by_client_id:  client.id,
      })
      .eq('id', invite.id);

    if (tokenError) {
      console.error('Token mark-used failed:', tokenError);
      // Client was created though — return success anyway
    }

    return NextResponse.json({
      client_id: client.id,
      name:      client.name,
      success:   true,
    });

  } catch (e) {
    console.error('Onboard complete exception:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
