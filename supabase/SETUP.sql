-- BR@VO fresh-project setup. Run once against a new, empty Supabase project.
-- For an existing project, apply only unapplied migrations.

-- BR@VO foundation: academic classifications, profiles, roles, and secure self-service access.
-- Apply with `supabase db push` after linking a Supabase project.

create type public.app_role as enum ('admin', 'student');

create table public.academic_levels (
  id text primary key check (id in ('grade_12', 'freshman')),
  name text not null unique,
  sort_order smallint not null unique check (sort_order > 0)
);

create table public.streams (
  id text primary key check (id in ('natural_science', 'social_science')),
  name text not null unique,
  sort_order smallint not null unique check (sort_order > 0)
);

insert into public.academic_levels (id, name, sort_order) values
  ('grade_12', 'Grade 12', 1),
  ('freshman', 'University Freshman', 2);

insert into public.streams (id, name, sort_order) values
  ('natural_science', 'Natural Science', 1),
  ('social_science', 'Social Science', 2);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 100),
  academic_level text not null references public.academic_levels(id),
  stream text not null references public.streams(id),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index profiles_level_stream_idx on public.profiles (academic_level, stream);
create index profiles_created_at_idx on public.profiles (created_at desc);

create function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = _role
  );
$$;

revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_level text := coalesce(new.raw_user_meta_data ->> 'academic_level', '');
  requested_stream text := coalesce(new.raw_user_meta_data ->> 'stream', '');
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  if requested_level not in ('grade_12', 'freshman') then
    raise exception 'Please select a valid academic level.';
  end if;
  if requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;

  insert into public.profiles (id, full_name, academic_level, stream)
  values (new.id, requested_name, requested_level, requested_stream);

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.academic_levels enable row level security;
alter table public.streams enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "Academic levels are readable by everyone"
on public.academic_levels for select
to anon, authenticated using (true);

create policy "Streams are readable by everyone"
on public.streams for select
to anon, authenticated using (true);

create policy "Users can read their own profile or admins can read all"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select public.has_role('admin')));

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Users can read their own role or admins can read all"
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()) or (select public.has_role('admin')));

grant select on public.academic_levels, public.streams to anon, authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;

-- Deliberately no client insert/update/delete grants for user_roles. New accounts
-- always receive the student role via the auth trigger. Promote an admin only
-- through a trusted database operator using the documented procedure.

-- Collect Ethiopian mobile and CBE account details during registration.
-- Existing profiles remain nullable; the auth trigger requires both for new accounts.

alter table public.profiles
  add column phone_number text,
  add column cbe_account_number text,
  add constraint profiles_phone_number_ethiopian_mobile_check
    check (phone_number is null or phone_number ~ '^\+251[79][0-9]{8}$'),
  add constraint profiles_cbe_account_number_check
    check (cbe_account_number is null or cbe_account_number ~ '^[0-9]{13}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_level text := coalesce(new.raw_user_meta_data ->> 'academic_level', '');
  requested_stream text := coalesce(new.raw_user_meta_data ->> 'stream', '');
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  requested_phone text := trim(coalesce(new.raw_user_meta_data ->> 'phone_number', ''));
  requested_cbe_account text := trim(coalesce(new.raw_user_meta_data ->> 'cbe_account_number', ''));
begin
  if requested_level not in ('grade_12', 'freshman') then
    raise exception 'Please select a valid academic level.';
  end if;
  if requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;
  if requested_cbe_account !~ '^[0-9]{13}$' then
    raise exception 'Please enter a valid 13-digit CBE account number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone_number, cbe_account_number
  )
  values (
    new.id, requested_name, requested_level, requested_stream,
    requested_phone, requested_cbe_account
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

-- Competition listings, student registration, and administrator management.

create table public.competitions (
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

create index competitions_status_start_idx
  on public.competitions (status, starts_at);

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

create table public.competition_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint competition_registrations_unique_user unique (competition_id, user_id)
);

create index competition_registrations_user_id_idx
  on public.competition_registrations (user_id);

alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;

revoke all on table public.competitions, public.competition_registrations from public, anon, authenticated;
grant select, insert, update, delete on public.competitions to authenticated;
grant select, insert, delete on public.competition_registrations to authenticated;

create policy "Signed-in users can read published competitions and admins can read all"
on public.competitions for select
to authenticated
using (status in ('published', 'closed') or (select public.has_role('admin')));

create policy "Admins can create competitions"
on public.competitions for insert
to authenticated
with check (
  (select public.has_role('admin'))
  and created_by = (select auth.uid())
);

create policy "Admins can update competitions"
on public.competitions for update
to authenticated
using ((select public.has_role('admin')))
with check ((select public.has_role('admin')));

create policy "Admins can delete competitions"
on public.competitions for delete
to authenticated
using ((select public.has_role('admin')));

create policy "Users can read their own registrations and admins can read all"
on public.competition_registrations for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.has_role('admin'))
);

create policy "Eligible users can register for published competitions"
on public.competition_registrations for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.competitions as competition
    where competition.id = competition_id
      and competition.status = 'published'
      and competition.registration_deadline > now()
      and competition.starts_at > now()
      and (
        competition.academic_level is null
        or competition.academic_level = (
          select profile.academic_level
          from public.profiles as profile
          where profile.id = (select auth.uid())
        )
      )
      and (
        competition.stream is null
        or competition.stream = (
          select profile.stream
          from public.profiles as profile
          where profile.id = (select auth.uid())
        )
      )
  )
);

create policy "Users can withdraw before the deadline and admins can remove registrations"
on public.competition_registrations for delete
to authenticated
using (
  (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.competitions as competition
      where competition.id = competition_id
        and competition.status = 'published'
        and competition.registration_deadline > now()
    )
  )
  or (select public.has_role('admin'))
);
