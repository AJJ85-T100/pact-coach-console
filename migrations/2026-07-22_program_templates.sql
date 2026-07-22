-- Programme templates: a coach's reusable blocks. Sessions live as a JSONB
-- snapshot (same shape as program_sessions rows: name, week_number, day_index,
-- notes, exercises[]) — loading a template onto a client expands them into
-- real program_sessions rows the coach then edits freely.
--
-- Run in the Supabase SQL editor (project rwmmtqchrnlpnjzkrjwg), then keep
-- this file in fitness-coach-bot/migrations/ with the others.

create table if not exists program_templates (
  id uuid primary key default gen_random_uuid(),
  pt_id uuid not null references personal_trainers(id) on delete cascade,
  name text not null,
  weeks int,
  notes text,
  sessions jsonb not null default '[]'::jsonb,
  source_program_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_program_templates_pt
  on program_templates (pt_id, updated_at desc);
