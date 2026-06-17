/**
 * /api/exercises
 *
 * GET  — List the whole exercise library (seed + custom), ordered by name.
 *        The picker reads this once and filters client-side.
 * POST — Create a custom exercise. Returns the existing row if the name is
 *        already taken (so the picker can just select it).
 *
 * Uses the shared no-cache admin client so a freshly-added custom exercise
 * shows up immediately.
 */

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };

// ============================================================================
// GET — list the library
// ============================================================================
export async function GET() {
  noStore();

  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, category, equipment, is_custom, created_by_pt_id')
    .order('name', { ascending: true });

  if (error) {
    console.error('[exercises] list failed', error);
    return NextResponse.json({ error: 'Could not load exercises.' }, { status: 500 });
  }

  return NextResponse.json({ exercises: data || [] }, { headers: noStoreHeaders });
}

// ============================================================================
// POST — create a custom exercise
// ============================================================================
export async function POST(req) {
  noStore();

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Exercise name is required.' }, { status: 400 });
  }

  // Normalise equipment to a clean array of lowercase tags (empty = no kit needed).
  const equipment = Array.isArray(body.equipment)
    ? body.equipment
        .filter((e) => typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const category = typeof body.category === 'string' && body.category.trim()
    ? body.category.trim()
    : null;

  const createdBy = typeof body.created_by_pt_id === 'string' ? body.created_by_pt_id : null;

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name,
      category,
      equipment,
      is_custom: true,
      created_by_pt_id: createdBy,
    })
    .select('id, name, category, equipment, is_custom, created_by_pt_id')
    .maybeSingle();

  if (error) {
    // Name already exists — hand back the existing row so the picker can select it.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('exercises')
        .select('id, name, category, equipment, is_custom, created_by_pt_id')
        .eq('name', name)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ exercise: existing, existed: true }, { headers: noStoreHeaders });
      }
    }
    console.error('[exercises] create failed', error);
    return NextResponse.json({ error: 'Could not create exercise.' }, { status: 500 });
  }

  return NextResponse.json({ exercise: data }, { status: 201, headers: noStoreHeaders });
}
