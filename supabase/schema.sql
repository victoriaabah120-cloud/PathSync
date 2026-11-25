-- PathSync database schema. Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  career_field text,
  specialization text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  career_field text not null,
  specialization text not null,
  position int not null,
  title text not null,
  summary text,
  content jsonb,
  quiz jsonb,
  status text not null default 'locked' check (status in ('locked', 'current', 'completed')),
  score int,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_lessons_user_idx on public.user_lessons (user_id, position);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holder_name text not null,
  course_title text not null,
  career_field text not null,
  specialization text not null,
  score int not null,
  lessons_completed int not null default 0,
  certificate_code text not null,
  issued_at timestamptz not null default now()
);

-- One certificate per learner per course, and codes are never reused.
create unique index if not exists certificates_one_per_course
  on public.certificates (user_id, career_field, specialization);
create unique index if not exists certificates_code_key
  on public.certificates (certificate_code);

create index if not exists certificates_user_idx on public.certificates (user_id, issued_at desc);

-- Final course assessments. Questions (with answer keys) stay on the server; the
-- browser never sees this table, which is why it has no policy at all.
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

alter table public.profiles enable row level security;
alter table public.user_lessons enable row level security;
alter table public.certificates enable row level security;
alter table public.course_assessments enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own lessons" on public.user_lessons;
create policy "own lessons" on public.user_lessons
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Certificates are issued by the PathSync API only, so learners may read but never
-- write them. This is what makes the completion check authoritative.
drop policy if exists "own certificates" on public.certificates;
drop policy if exists "read own certificates" on public.certificates;
create policy "read own certificates" on public.certificates
  for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
