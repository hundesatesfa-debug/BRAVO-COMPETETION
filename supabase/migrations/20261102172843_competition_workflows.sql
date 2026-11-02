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
