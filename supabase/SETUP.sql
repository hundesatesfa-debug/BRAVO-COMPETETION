-- BRAVO Academy: complete SQL Editor bootstrap and schema repair.
-- Covers tables currently used by the app: profiles, roles, academic levels,
-- streams, competitions, and competition registrations.
-- Run as the Supabase project owner. It creates missing objects, adds the
-- freshman profile fields, updates policies/triggers, and preserves existing rows.
-- It does not create Supabase CLI migration history.

begin;

do $$
begin
  create type public.app_role as enum ('admin', 'student');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.academic_levels (
  id text primary key check (id in ('grade_12', 'freshman')),
  name text not null unique,
  sort_order smallint not null unique check (sort_order > 0)
);

create table if not exists public.streams (
  id text primary key check (id in ('natural_science', 'social_science')),
  name text not null unique,
  sort_order smallint not null unique check (sort_order > 0)
);

insert into public.academic_levels (id, name, sort_order)
values ('grade_12', 'Grade 12', 1), ('freshman', 'University Freshman', 2)
on conflict (id) do update
set name = excluded.name, sort_order = excluded.sort_order;

insert into public.streams (id, name, sort_order)
values ('natural_science', 'Natural Science', 1), ('social_science', 'Social Science', 2)
on conflict (id) do update
set name = excluded.name, sort_order = excluded.sort_order;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  academic_level text not null references public.academic_levels(id),
  stream text references public.streams(id),
  phone_number text,
  cbe_account_number text,
  university text,
  department text,
  academic_year smallint,
  student_id text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add fields used by the current app to an existing Bravo profiles table.
alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists cbe_account_number text,
  add column if not exists university text,
  add column if not exists department text,
  add column if not exists academic_year smallint,
  add column if not exists student_id text,
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  alter column stream drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_full_name_length_check') then
    alter table public.profiles add constraint profiles_full_name_length_check
      check (char_length(trim(full_name)) between 1 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_phone_number_ethiopian_mobile_check') then
    alter table public.profiles add constraint profiles_phone_number_ethiopian_mobile_check
      check (phone_number is null or phone_number ~ '^\+251[79][0-9]{8}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_cbe_account_number_check') then
    alter table public.profiles add constraint profiles_cbe_account_number_check
      check (cbe_account_number is null or cbe_account_number ~ '^[0-9]{13}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_university_length_check') then
    alter table public.profiles add constraint profiles_university_length_check
      check (university is null or char_length(trim(university)) between 2 and 150) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_department_length_check') then
    alter table public.profiles add constraint profiles_department_length_check
      check (department is null or char_length(trim(department)) between 2 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_academic_year_check') then
    alter table public.profiles add constraint profiles_academic_year_check
      check (academic_year is null or academic_year between 1 and 8) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_student_id_length_check') then
    alter table public.profiles add constraint profiles_student_id_length_check
      check (student_id is null or char_length(trim(student_id)) between 1 and 80) not valid;
  end if;
end
$$;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists profiles_level_stream_idx
  on public.profiles (academic_level, stream);
create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);
create index if not exists profiles_university_year_idx
  on public.profiles (university, academic_year);

create or replace function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = _role
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_level text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'academic_level'), ''), 'freshman');
  requested_stream text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'stream', '')), '');
  requested_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone_number', new.phone, '')), '');
  requested_university text := trim(coalesce(new.raw_user_meta_data ->> 'university', ''));
  requested_department text := trim(coalesce(new.raw_user_meta_data ->> 'department', ''));
  requested_year_text text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'academic_year'), ''), '1');
  requested_student_id text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_id', '')), '');
  requested_year smallint;
begin
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_level <> 'freshman' then
    raise exception 'BRAVO Academy registration is for university freshmen.';
  end if;
  if requested_stream is not null and requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if char_length(requested_university) not between 2 and 150 then
    raise exception 'Please enter a valid university name.';
  end if;
  if char_length(requested_department) not between 2 and 120 then
    raise exception 'Please enter a valid department.';
  end if;
  if requested_year_text !~ '^[1-8]$' then
    raise exception 'Academic year must be between 1 and 8.';
  end if;
  requested_year := requested_year_text::smallint;
  if requested_student_id is not null and char_length(requested_student_id) not between 1 and 80 then
    raise exception 'Student ID must be 80 characters or fewer.';
  end if;
  if requested_phone is not null and requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone_number,
    university, department, academic_year, student_id
  )
  values (
    new.id, requested_name, requested_level, requested_stream, requested_phone,
    requested_university, requested_department, requested_year, requested_student_id
  );

  -- New accounts are always students. Promote admins separately as a trusted owner.
  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text not null check (char_length(trim(description)) between 1 and 4000),
  academic_level text references public.academic_levels(id),
  stream text references public.streams(id),
  registration_deadline timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_deadline_before_start_check check (registration_deadline <= starts_at),
  constraint competitions_end_after_start_check check (ends_at > starts_at)
);

create index if not exists competitions_status_start_idx
  on public.competitions (status, starts_at);

create table if not exists public.competition_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint competition_registrations_unique_user unique (competition_id, user_id)
);

create index if not exists competition_registrations_user_id_idx
  on public.competition_registrations (user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists competitions_set_updated_at on public.competitions;
create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.academic_levels enable row level security;
alter table public.streams enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;

drop policy if exists "Academic levels are readable by everyone" on public.academic_levels;
create policy "Academic levels are readable by everyone"
on public.academic_levels for select
to anon, authenticated using (true);

drop policy if exists "Streams are readable by everyone" on public.streams;
create policy "Streams are readable by everyone"
on public.streams for select
to anon, authenticated using (true);

drop policy if exists "Users can read their own profile or admins can read all" on public.profiles;
create policy "Users can read their own profile or admins can read all"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select public.has_role('admin')));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Users can read their own role or admins can read all" on public.user_roles;
create policy "Users can read their own role or admins can read all"
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()) or (select public.has_role('admin')));

drop policy if exists "Signed-in users can read published competitions and admins can read all" on public.competitions;
create policy "Signed-in users can read published competitions and admins can read all"
on public.competitions for select
to authenticated
using (status in ('published', 'closed') or (select public.has_role('admin')));

drop policy if exists "Admins can create competitions" on public.competitions;
create policy "Admins can create competitions"
on public.competitions for insert
to authenticated
with check ((select public.has_role('admin')) and created_by = (select auth.uid()));

drop policy if exists "Admins can update competitions" on public.competitions;
create policy "Admins can update competitions"
on public.competitions for update
to authenticated
using ((select public.has_role('admin')))
with check ((select public.has_role('admin')));

drop policy if exists "Admins can delete competitions" on public.competitions;
create policy "Admins can delete competitions"
on public.competitions for delete
to authenticated
using ((select public.has_role('admin')));

drop policy if exists "Users can read their own registrations and admins can read all" on public.competition_registrations;
create policy "Users can read their own registrations and admins can read all"
on public.competition_registrations for select
to authenticated
using (user_id = (select auth.uid()) or (select public.has_role('admin')));

-- Remove policies that enabled free student registrations before payment verification exists.
drop policy if exists "Eligible users can register for published competitions" on public.competition_registrations;
drop policy if exists "Users can withdraw before the deadline and admins can remove registrations" on public.competition_registrations;

grant usage on schema public to anon, authenticated;

revoke all on public.academic_levels, public.streams from public, anon, authenticated;
grant select on public.academic_levels, public.streams to anon, authenticated;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
revoke update (id, full_name, academic_level, stream, phone_number, cbe_account_number, university, department, academic_year, student_id, avatar_url, created_at, updated_at)
  on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated;

revoke all on public.competitions from public, anon, authenticated;
grant select, insert, update, delete on public.competitions to authenticated;

revoke all on public.competition_registrations from public, anon, authenticated;
grant select on public.competition_registrations to authenticated;

revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;

-- To promote a trusted admin, first create that person's account in the app,
-- then run this as the Supabase project owner after replacing the email:
-- insert into public.user_roles (user_id, role)
-- select id, 'admin'::public.app_role
-- from auth.users
-- where lower(email) = lower('admin@example.com')
-- on conflict do nothing;
