import { createClient } from '@/lib/supabase/server';
import ExerciseBrowser from '@/components/ExerciseBrowser';

export const metadata = { title: 'Exercise library' };

export default async function ExercisesPage() {
  // User-scoped client so RLS applies: a coach sees the library plus their own
  // custom exercises, and nobody else's. See 09_fix_policies.sql.
  const supabase = createClient();

  const [{ data: exercises, error: exErr }, { data: frames }] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, slug, primary_muscle_label, equipment, movement_pattern, tier')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(1000),
    supabase
      .from('v_exercise_cards')
      .select('exercise_id, image_url, alt_text')
      .order('sort_order', { ascending: true }),
  ]);

  if (exErr) {
    return (
      <p className="text-sm text-gray-500">
        Could not load the library. {exErr.message}
      </p>
    );
  }

  // First frame per exercise is the one the grid shows.
  const cards = {};
  for (const f of frames || []) {
    if (!cards[f.exercise_id]) cards[f.exercise_id] = f;
  }

  return <ExerciseBrowser exercises={exercises || []} cards={cards} />;
}
