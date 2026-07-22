/**
 * /api/nutrition
 *
 * GET  — the coach's roster with each athlete's current nutrition targets
 *        (calories, protein, carbs, fat, steps) + current weight for context.
 * POST — { clientId, calories, protein, carbs, fat, steps } → update the
 *        athlete's targets on their clients row. PAX reads these on every
 *        message; the athlete app scores the day against them.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { requireCoach } from '@/lib/auth/requireCoach';
import { requireClientAccess } from '@/lib/auth/requireClientAccess';

export const dynamic = 'force-dynamic';

const FIELDS = {
  calories: 'calorie_target',
  protein:  'protein_target',
  carbs:    'carb_target',
  fat:      'fat_target',
  steps:    'step_target',
};

export async function GET() {
  noStore();
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const { data: clients = [] } = await coach.service
    .from('clients')
    .select('id, name, current_weight, goal, calorie_target, protein_target, carb_target, fat_target, step_target')
    .eq('pt_id', coach.pt.id)
    .order('name');
  return NextResponse.json({ clients });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const clientId = body?.clientId;
  if (!clientId) return NextResponse.json({ error: 'clientId required.' }, { status: 400 });

  const access = await requireClientAccess(clientId);
  if (access.error) return access.error;
  const coach = await requireCoach();
  if (coach.error) return coach.error;

  const patch = {};
  for (const [key, col] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') { patch[col] = null; continue; }
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return NextResponse.json({ error: `Invalid value for ${key}.` }, { status: 400 });
    }
    patch[col] = Math.round(n);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { error } = await coach.service.from('clients').update(patch).eq('id', clientId);
  if (error) {
    console.error('[nutrition] update failed', error);
    return NextResponse.json({ error: 'Could not save targets.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
