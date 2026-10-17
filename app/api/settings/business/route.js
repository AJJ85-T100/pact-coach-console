/**
 * /api/settings/business — the coach's own business numbers.
 *   GET → { baselineMonthlyChurnPct, available }
 *   PUT { baselineMonthlyChurnPct: number 0–100 | null }
 *
 * Scoped to the signed-in coach: requireCoach() resolves personal_trainers by
 * auth_user_id and the update is keyed on that id only. Column
 * personal_trainers.baseline_monthly_churn_pct comes from
 * migrations/2026-10-17_v2_autonomy_alerts.sql; until it runs, GET says
 * available:false and PUT returns 503 rather than failing obscurely.
 */
import { NextResponse } from 'next/server';
import { requireCoach } from '@/lib/auth/requireCoach';

export const dynamic = 'force-dynamic';

const MISSING = /column|does not exist|schema cache/i;

export async function GET() {
  const coach = await requireCoach();
  if (coach.error) return coach.error;
  const { data, error } = await coach.service.from('personal_trainers').select('*').eq('id', coach.pt.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load.' }, { status: 500 });
  const available = !!data && Object.prototype.hasOwnProperty.call(data, 'baseline_monthly_churn_pct');
  const v = available ? data.baseline_monthly_churn_pct : null;
  return NextResponse.json({ available, baselineMonthlyChurnPct: v == null ? null : Number(v) });
}

export async function PUT(req) {
  const coach = await requireCoach();
  if (coach.error) return coach.error;
  const body = await req.json().catch(() => null);
  const raw = body?.baselineMonthlyChurnPct;
  let value = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json({ error: 'Baseline churn must be a percentage between 0 and 100.' }, { status: 400 });
    }
    value = Math.round(value * 10) / 10;
  }
  const { error } = await coach.service
    .from('personal_trainers')
    .update({ baseline_monthly_churn_pct: value })
    .eq('id', coach.pt.id);
  if (error) {
    if (MISSING.test(error.message || '')) {
      return NextResponse.json({ error: 'This needs a database update first. It’ll work once that’s run.' }, { status: 503 });
    }
    console.error('[settings/business] save failed', error);
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, baselineMonthlyChurnPct: value });
}
