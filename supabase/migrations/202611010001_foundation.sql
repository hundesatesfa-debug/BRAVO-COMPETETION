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
