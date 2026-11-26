-- School Result Compiler: schema for the paid, multi-tenant module inside PathSync.
--
-- Everything new is prefixed src_ so it cannot collide with the existing career app
-- tables (profiles, user_lessons, certificates, course_assessments), which are left
-- untouched. Run once in the Supabase SQL Editor; safe to run more than once.
--
-- Clients get SELECT-only policies: every write goes through the PathSync API with the
-- service role, which is where eligibility, capacity, score validation, compilation and
-- publishing are enforced.

-- 0. Platform administrators (PathSync staff). Kept out of profiles so the existing
--    table and its policy stay exactly as they are.
create table if not exists public.src_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 1. Subscription plans. Prices live here, never in code.
create table if not exists public.src_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  min_students int not null default 1 check (min_students >= 1),
  max_students int check (max_students is null or max_students >= min_students),
  monthly_price_kobo bigint not null default 0 check (monthly_price_kobo >= 0),
  annual_price_kobo bigint not null default 0 check (annual_price_kobo >= 0),
  currency text not null default 'NGN',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Placeholder prices. Edit these rows to change pricing; the app reads them.
insert into public.src_plans (code, name, min_students, max_students, monthly_price_kobo, annual_price_kobo, sort_order)
values
  ('basic',      'Basic',      1,    100,  2500000,   25000000, 1),
  ('standard',   'Standard',   101,  300,  4500000,   45000000, 2),
  ('growth',     'Growth',     301,  600,  7500000,   75000000, 3),
  ('premium',    'Premium',    601,  1000, 11000000,  110000000, 4),
  ('enterprise', 'Enterprise', 1001, null, 18000000,  180000000, 5)
on conflict (code) do nothing;

-- 2. Schools, members, invitations
create table if not exists public.src_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique,
  school_type text not null default 'secondary'
    check (school_type in ('primary', 'secondary', 'combined', 'other')),
  email text not null,
  phone text,
  address text,
  city text,
  state text,
  country text not null default 'Nigeria',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.src_school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('school_admin', 'teacher', 'student')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  invited_email text,
  invited_by uuid references auth.users(id) on delete set null,
  invite_code text unique,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint src_member_needs_user_or_invite check (user_id is not null or invited_email is not null)
);

create unique index if not exists src_members_school_user_key
  on public.src_school_members (school_id, user_id) where user_id is not null;
create index if not exists src_members_user_idx on public.src_school_members (user_id);

-- 3. Academic structure
create table if not exists public.src_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.src_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  name text not null,
  position int not null default 1 check (position between 1 and 3),
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, name)
);

create table if not exists public.src_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  name text not null,
  level text,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.src_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  code text,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists public.src_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  admission_no text not null,
  first_name text not null,
  last_name text not null,
  middle_name text,
  gender text check (gender in ('male', 'female', 'other')),
  date_of_birth date,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  user_id uuid references auth.users(id) on delete set null,
  invite_code text unique,
  status text not null default 'active' check (status in ('active', 'graduated', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_no)
);

create unique index if not exists src_students_user_key
  on public.src_students (user_id) where user_id is not null;

create table if not exists public.src_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  student_id uuid not null references public.src_students(id) on delete cascade,
  class_id uuid not null references public.src_classes(id) on delete restrict,
  session_id uuid not null references public.src_sessions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'left')),
  created_at timestamptz not null default now(),
  unique (student_id, session_id)
);

create table if not exists public.src_class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  class_id uuid not null references public.src_classes(id) on delete cascade,
  subject_id uuid not null references public.src_subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, class_id, subject_id)
);

-- One row per responsibility. A teacher keeps ONE account and can hold several rows:
-- Mathematics in JSS1, English in JSS2 and form teacher of JSS2 are three rows.
create table if not exists public.src_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  member_id uuid not null references public.src_school_members(id) on delete cascade,
  class_id uuid not null references public.src_classes(id) on delete cascade,
  subject_id uuid references public.src_subjects(id) on delete cascade,
  kind text not null check (kind in ('subject', 'form')),
  created_at timestamptz not null default now(),
  constraint src_assignment_shape check (
    (kind = 'subject' and subject_id is not null) or (kind = 'form' and subject_id is null)
  )
);

create unique index if not exists src_assignment_subject_key
  on public.src_assignments (session_id, class_id, subject_id) where kind = 'subject';
create unique index if not exists src_assignment_form_key
  on public.src_assignments (session_id, class_id) where kind = 'form';
create index if not exists src_assignment_member_idx on public.src_assignments (member_id);

-- 4. Assessment configuration, versioned so published results keep their scale
create table if not exists public.src_assessment_configs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  term_id uuid references public.src_terms(id) on delete cascade,
  version int not null default 1 check (version >= 1),
  ca1_max numeric(5,1) not null default 10 check (ca1_max >= 0),
  ca2_max numeric(5,1) not null default 10 check (ca2_max >= 0),
  ca3_max numeric(5,1) not null default 10 check (ca3_max >= 0),
  exam_max numeric(5,1) not null default 70 check (exam_max >= 0),
  total_max numeric(5,1) not null default 100 check (total_max > 0),
  pass_mark numeric(5,1) not null default 40 check (pass_mark >= 0),
  grading_scale jsonb not null default '[
    {"min":75,"max":100,"grade":"A1","remark":"Excellent"},
    {"min":70,"max":74,"grade":"B2","remark":"Very good"},
    {"min":65,"max":69,"grade":"B3","remark":"Good"},
    {"min":60,"max":64,"grade":"C4","remark":"Credit"},
    {"min":55,"max":59,"grade":"C5","remark":"Credit"},
    {"min":50,"max":54,"grade":"C6","remark":"Credit"},
    {"min":45,"max":49,"grade":"D7","remark":"Pass"},
    {"min":40,"max":44,"grade":"E8","remark":"Pass"},
    {"min":0,"max":39,"grade":"F9","remark":"Fail"}
  ]'::jsonb,
  rank_policy text not null default 'competition'
    check (rank_policy in ('competition', 'dense', 'ordinal')),
  incomplete_policy text not null default 'block' check (incomplete_policy in ('block', 'exclude')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint src_config_total_matches check (ca1_max + ca2_max + ca3_max + exam_max = total_max)
);

create unique index if not exists src_config_version_key
  on public.src_assessment_configs (school_id, session_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

-- 5. Score sheets and scores
create table if not exists public.src_score_sheets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  term_id uuid not null references public.src_terms(id) on delete cascade,
  class_id uuid not null references public.src_classes(id) on delete restrict,
  subject_id uuid not null references public.src_subjects(id) on delete restrict,
  member_id uuid references public.src_school_members(id) on delete set null,
  config_id uuid references public.src_assessment_configs(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'returned', 'approved')),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, term_id, class_id, subject_id)
);

create table if not exists public.src_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  sheet_id uuid not null references public.src_score_sheets(id) on delete cascade,
  student_id uuid not null references public.src_students(id) on delete cascade,
  ca1 numeric(5,1) check (ca1 >= 0),
  ca2 numeric(5,1) check (ca2 >= 0),
  ca3 numeric(5,1) check (ca3 >= 0),
  exam numeric(5,1) check (exam >= 0),
  total numeric(6,1) check (total >= 0),
  grade text,
  remark text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (sheet_id, student_id)
);

create index if not exists src_scores_sheet_idx on public.src_scores (sheet_id);

-- 6. Compilations, compiled results, audit trail
create table if not exists public.src_compilations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  session_id uuid not null references public.src_sessions(id) on delete cascade,
  term_id uuid not null references public.src_terms(id) on delete cascade,
  class_id uuid not null references public.src_classes(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'returned', 'approved', 'published')),
  config_snapshot jsonb,
  class_size int,
  class_average numeric(6,1),
  compiled_by uuid references auth.users(id) on delete set null,
  compiled_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  return_reason text,
  form_teacher_remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, term_id, class_id)
);

create table if not exists public.src_compiled_results (
  id uuid primary key default gen_random_uuid(),
  compilation_id uuid not null references public.src_compilations(id) on delete cascade,
  school_id uuid not null references public.src_schools(id) on delete cascade,
  student_id uuid not null references public.src_students(id) on delete cascade,
  total_score numeric(7,1) not null default 0,
  average numeric(6,1) not null default 0,
  subjects_offered int not null default 0,
  subjects_passed int not null default 0,
  subjects_failed int not null default 0,
  position int,
  incomplete boolean not null default false,
  subject_results jsonb not null default '[]'::jsonb,
  attendance_present int,
  attendance_total int,
  principal_remark text,
  created_at timestamptz not null default now(),
  unique (compilation_id, student_id)
);

create index if not exists src_compiled_results_compilation_idx
  on public.src_compiled_results (compilation_id, position);

create table if not exists public.src_result_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  compilation_id uuid references public.src_compilations(id) on delete cascade,
  sheet_id uuid references public.src_score_sheets(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists src_result_events_school_idx
  on public.src_result_events (school_id, created_at desc);

-- 7. Subscriptions, payments, invoices, webhook idempotency
create table if not exists public.src_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  plan_id uuid not null references public.src_plans(id) on delete restrict,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'expired', 'cancelled')),
  student_capacity int not null check (student_capacity > 0),
  amount_kobo bigint not null default 0 check (amount_kobo >= 0),
  currency text not null default 'NGN',
  paystack_reference text,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists src_subscription_open_key
  on public.src_subscriptions (school_id) where status in ('active', 'pending');
create index if not exists src_subscription_school_idx on public.src_subscriptions (school_id, created_at desc);

create table if not exists public.src_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  subscription_id uuid references public.src_subscriptions(id) on delete set null,
  provider text not null default 'paystack',
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  channel text,
  paid_at timestamptz,
  verified_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.src_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.src_schools(id) on delete cascade,
  subscription_id uuid references public.src_subscriptions(id) on delete set null,
  payment_id uuid references public.src_payments(id) on delete set null,
  number text not null unique,
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  issued_on date not null default current_date,
  due_on date,
  paid_on date,
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.src_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- 8. Row level security helpers
create or replace function public.src_is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.src_platform_admins where user_id = auth.uid());
$$;

create or replace function public.src_is_member(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.src_school_members
    where school_id = p_school and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.src_is_staff(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.src_school_members
    where school_id = p_school and user_id = auth.uid() and status = 'active'
      and role in ('school_admin', 'teacher')
  );
$$;

create or replace function public.src_is_school_admin(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.src_school_members
    where school_id = p_school and user_id = auth.uid() and status = 'active'
      and role = 'school_admin'
  );
$$;

create or replace function public.src_my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.src_students where user_id = auth.uid() limit 1;
$$;

-- 9. RLS: enabled everywhere, select-only policies for clients.
alter table public.src_platform_admins enable row level security;
alter table public.src_plans enable row level security;
alter table public.src_schools enable row level security;
alter table public.src_school_members enable row level security;
alter table public.src_sessions enable row level security;
alter table public.src_terms enable row level security;
alter table public.src_classes enable row level security;
alter table public.src_subjects enable row level security;
alter table public.src_students enable row level security;
alter table public.src_enrolments enable row level security;
alter table public.src_class_subjects enable row level security;
alter table public.src_assignments enable row level security;
alter table public.src_assessment_configs enable row level security;
alter table public.src_score_sheets enable row level security;
alter table public.src_scores enable row level security;
alter table public.src_compilations enable row level security;
alter table public.src_compiled_results enable row level security;
alter table public.src_result_events enable row level security;
alter table public.src_subscriptions enable row level security;
alter table public.src_payments enable row level security;
alter table public.src_invoices enable row level security;
alter table public.src_webhook_events enable row level security;

drop policy if exists "src plans are public" on public.src_plans;
create policy "src plans are public" on public.src_plans for select using (true);

drop policy if exists "src read own school" on public.src_schools;
create policy "src read own school" on public.src_schools for select
  using (public.src_is_member(id) or public.src_is_platform_admin());

drop policy if exists "src read own membership" on public.src_school_members;
create policy "src read own membership" on public.src_school_members for select
  using (user_id = auth.uid() or public.src_is_school_admin(school_id) or public.src_is_platform_admin());

drop policy if exists "src read school sessions" on public.src_sessions;
create policy "src read school sessions" on public.src_sessions for select using (public.src_is_member(school_id));

drop policy if exists "src read school terms" on public.src_terms;
create policy "src read school terms" on public.src_terms for select using (public.src_is_member(school_id));

drop policy if exists "src read school classes" on public.src_classes;
create policy "src read school classes" on public.src_classes for select using (public.src_is_member(school_id));

drop policy if exists "src read school subjects" on public.src_subjects;
create policy "src read school subjects" on public.src_subjects for select using (public.src_is_member(school_id));

drop policy if exists "src read school students" on public.src_students;
create policy "src read school students" on public.src_students for select
  using (user_id = auth.uid() or public.src_is_staff(school_id));

drop policy if exists "src read own enrolment" on public.src_enrolments;
create policy "src read own enrolment" on public.src_enrolments for select
  using (student_id = public.src_my_student_id() or public.src_is_staff(school_id));

drop policy if exists "src read class subjects" on public.src_class_subjects;
create policy "src read class subjects" on public.src_class_subjects for select using (public.src_is_member(school_id));

drop policy if exists "src read assignments" on public.src_assignments;
create policy "src read assignments" on public.src_assignments for select using (public.src_is_staff(school_id));

drop policy if exists "src read configs" on public.src_assessment_configs;
create policy "src read configs" on public.src_assessment_configs for select using (public.src_is_staff(school_id));

drop policy if exists "src read sheets" on public.src_score_sheets;
create policy "src read sheets" on public.src_score_sheets for select using (public.src_is_staff(school_id));

drop policy if exists "src read scores" on public.src_scores;
create policy "src read scores" on public.src_scores for select using (public.src_is_staff(school_id));

drop policy if exists "src read compilations" on public.src_compilations;
create policy "src read compilations" on public.src_compilations for select
  using (
    public.src_is_staff(school_id)
    or (
      status = 'published'
      and exists (
        select 1 from public.src_compiled_results r
        where r.compilation_id = id and r.student_id = public.src_my_student_id()
      )
    )
  );

drop policy if exists "src read compiled results" on public.src_compiled_results;
create policy "src read compiled results" on public.src_compiled_results for select
  using (
    public.src_is_staff(school_id)
    or (
      student_id = public.src_my_student_id()
      and exists (
        select 1 from public.src_compilations c
        where c.id = compilation_id and c.status = 'published'
      )
    )
  );

drop policy if exists "src read audit" on public.src_result_events;
create policy "src read audit" on public.src_result_events for select using (public.src_is_school_admin(school_id));

drop policy if exists "src read subscriptions" on public.src_subscriptions;
create policy "src read subscriptions" on public.src_subscriptions for select
  using (public.src_is_school_admin(school_id) or public.src_is_platform_admin());

drop policy if exists "src read payments" on public.src_payments;
create policy "src read payments" on public.src_payments for select
  using (public.src_is_school_admin(school_id) or public.src_is_platform_admin());

drop policy if exists "src read invoices" on public.src_invoices;
create policy "src read invoices" on public.src_invoices for select
  using (public.src_is_school_admin(school_id) or public.src_is_platform_admin());

-- src_platform_admins and src_webhook_events intentionally have no policies:
-- only the service role (the API) may touch them.
