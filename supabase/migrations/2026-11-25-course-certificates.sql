-- Upgrade an existing PathSync database to course-level certification.
-- Run once in the Supabase SQL Editor. Safe to run more than once.
-- (A fresh project can simply run supabase/schema.sql instead.)

-- 1. Certificates become one-per-course instead of one-per-lesson.
alter table public.certificates add column if not exists course_title text;
alter table public.certificates add column if not exists lessons_completed int not null default 0;
alter table public.certificates alter column lesson_id drop not null;
alter table public.certificates alter column lesson_title drop not null;

-- Older rows were issued for single lessons. Keep them readable by using the old
-- lesson title as the course title. Delete them instead if you prefer a clean slate:
--   delete from public.certificates;
update public.certificates
   set course_title = coalesce(course_title, lesson_title, 'PathSync course')
 where course_title is null;

alter table public.certificates alter column course_title set not null;

create unique index if not exists certificates_one_per_course
  on public.certificates (user_id, career_field, specialization);
create unique index if not exists certificates_code_key
  on public.certificates (certificate_code);

-- 2. Final course assessments (server-only table: no policies on purpose).
create table if not exists public.course_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  career_field text not null,
  specialization text not null,
  questions jsonb not null,
  answers jsonb,
  score int,
  passed boolean,
  status text not null default 'pending' check (status in ('pending', 'submitted')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists course_assessments_user_idx
  on public.course_assessments (user_id, created_at desc);

alter table public.course_assessments enable row level security;

-- 3. Learners may read their certificates but never insert one.
drop policy if exists "own certificates" on public.certificates;
drop policy if exists "read own certificates" on public.certificates;
create policy "read own certificates" on public.certificates
  for select using (auth.uid() = user_id);
