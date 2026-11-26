-- Upgrade an existing PathSync database to course-level certification.
-- Run once in the Supabase SQL Editor. Safe to run more than once, and safe on a
-- database that already has the newer certificates table.
-- (A fresh project can simply run supabase/schema.sql instead.)

-- 1. Certificates carry the course, not a single lesson.
alter table public.certificates add column if not exists course_title text;
alter table public.certificates add column if not exists lessons_completed int not null default 0;

-- Older rows were issued per lesson, so lesson_id and lesson_title existed and were
-- required. Keep them (as history) but stop requiring them for course certificates.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'certificates' and column_name = 'lesson_id'
  ) then
    alter table public.certificates alter column lesson_id drop not null;
alter table public.certificates alter column lesson_title drop not null;

update public.certificates
   set course_title = coalesce(course_title, lesson_title, 'PathSync course')
 where course_title is null;
end if;
end $$;

update public.certificates set course_title = 'PathSync course' where course_title is null;
alter table public.certificates alter column course_title set not null;

-- 2. Uniqueness.
-- The certificate code is derived from the learner and the course, so it is unique per
-- course on its own. The (user, course) index is a second guard: where the old
-- per-lesson columns exist it is made partial, so a historic lesson certificate can
-- never block (or be mistaken for) a course certificate.
create unique index if not exists certificates_code_key
  on public.certificates (certificate_code);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'certificates' and column_name = 'lesson_id'
  ) then
    drop index if exists public.certificates_one_per_course;
    create unique index if not exists certificates_one_per_course
      on public.certificates (user_id, career_field, specialization)
      where lesson_id is null;
  else
    create unique index if not exists certificates_one_per_course
      on public.certificates (user_id, career_field, specialization);
  end if;
end $$;

-- 3. Final course assessments (server-only table: no policies on purpose, so the
--    browser can never read the answer key or write a result).
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

-- 4. Learners may read their certificates but never write one.
--
-- This is the important one. The original schema gave learners a "for all" policy on
-- certificates, so a signed-in browser could POST a certificate straight to Supabase
-- and skip the assessment entirely. Every policy on the table is removed here (whatever
-- it happens to be called) and only a select policy is put back, so the API is the
-- only writer. Check it afterwards with:
--   select policyname, cmd from pg_policies where tablename = 'certificates';
--   -- expect exactly one row: "read own certificates" | SELECT
alter table public.certificates enable row level security;

do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'certificates'
  loop
    execute format('drop policy if exists %I on public.certificates', existing_policy.policyname);
  end loop;
end $$;

create policy "read own certificates" on public.certificates
  for select using (auth.uid() = user_id);
