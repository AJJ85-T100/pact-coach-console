/**
 * /api/clients/[clientId]/billing — what this athlete pays and when they renew.
 *   GET → { available, monthlyFee, renewalDate }
 *   PUT { monthlyFee: number ≥ 0 | null, renewalDate: 'YYYY-MM-DD' | null }
 *
 * Guarded by requireClientAccess (the signed-in coach must own the athlete);
 * the write touches only these two columns on that one row. Columns
 * clients.monthly_fee and clients.renewal_date come from
 * migrations/2026-10-17_v2_autonomy_alerts.sql; until it runs, PUT returns 503.
 */
import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

const MISSING = /column|does not exist|schema cache/i;

export async function GET(_req, { params }) {
  noStore();
  const access = await requireClientAccess(params?.clientId);
  if (access.error) return access.error;
  const { data, error } = await createServiceClient().from('clients').select('*').eq('id', access.client.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Could not load.' }, { status: 500 });
  const available = Object.prototype.hasOwnProperty.call(data, 'monthly_fee') && Object.prototype.hasOwnProperty.call(data, 'renewal_date');
  return NextResponse.json({
    available,
    monthlyFee: available && data.monthly_fee != null ? Number(data.monthly_fee) : null,
    renewalDate: available && data.renewal_date ? String(data.renewal_date).slice(0, 10) : null,
  });
}

export async function PUT(req, { params }) {
  noStore();
  const access = await requireClientAccess(params?.clientId);
  if (access.error) return access.error;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body required.' }, { status: 400 });

  let fee = null;
  if (body.monthlyFee !== null && body.monthlyFee !== undefined && body.monthlyFee !== '') {
    fee = Number(body.monthlyFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) {
      return NextResponse.json({ error: 'Monthly fee must be a number of pounds, 0 or more.' }, { status: 400 });
    }
    fee = Math.round(fee * 100) / 100;
  }
  let renewal = null;
  if (body.renewalDate) {
    const s = String(body.renewalDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00Z`))) {
      return NextResponse.json({ error: 'Renewal date must be a date.' }, { status: 400 });
    }
    renewal = s;
  }

  const { error } = await createServiceClient()
    .from('clients')
    .update({ monthly_fee: fee, renewal_date: renewal })
    .eq('id', access.client.id)
    .eq('pt_id', access.pt.id);
  if (error) {
    if (MISSING.test(error.message || '')) {
      return NextResponse.json({ error: 'This needs a database update first. It’ll work once that’s run.' }, { status: 503 });
    }
    console.error('[clients/billing] save failed', error);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, monthlyFee: fee, renewalDate: renewal });
}
