-- BRAVO Academy Phase 2: local-first study library and Bravo wallet.
-- Material files remain in the student's browser. Supabase receives metadata
-- and bounded session statistics only; all reward writes happen in the RPC.

begin;

create table if not exists public.study_documents_metadata (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  file_type text not null check (file_type in ('pdf', 'ppt', 'pptx')),
  size_bytes bigint not null check (size_bytes >= 0),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint study_documents_metadata_owner_id_unique unique (user_id, id)
);

create table if not exists public.study_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_seconds integer not null check (active_seconds >= 0 and active_seconds <= 86400),
  interaction_count integer not null check (interaction_count >= 0),
  pages_viewed integer not null check (pages_viewed >= 0),
  validation_status text not null check (validation_status in ('accepted', 'flagged')),
  risk_flags text[] not null default '{}',
  synced_at timestamptz not null default now(),
  constraint study_sessions_document_owner_fk foreign key (user_id, document_id)
    references public.study_documents_metadata(user_id, id) on delete cascade,
  constraint study_sessions_end_after_start check (ended_at >= started_at)
);

create table if not exists public.weekly_bravo_balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  study_seconds bigint not null default 0 check (study_seconds >= 0),
  study_bravos smallint not null default 0 check (study_bravos between 0 and 50),
  unique_document_bravos smallint not null default 0 check (unique_document_bravos between 0 and 30),
  consistency_bravos smallint not null default 0 check (consistency_bravos between 0 and 20),
  total_bravos smallint not null default 0 check (total_bravos between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table if not exists public.daily_streak_registry (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  qualifying boolean not null default false,
  consistency_rewarded boolean not null default false,
  primary key (user_id, study_date)
);

create table if not exists public.weekly_document_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  document_id uuid not null,
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  unique_rewarded boolean not null default false,
  primary key (user_id, week_start, document_id),
  constraint weekly_document_activity_owner_fk foreign key (user_id, document_id)
    references public.study_documents_metadata(user_id, id) on delete cascade
);

create table if not exists public.bravo_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  category text not null check (category in ('study_time', 'unique_document', 'daily_consistency')),
  source_key text not null,
  description text not null,
  amount smallint not null check (amount between 1 and 100),
  created_at timestamptz not null default now(),
  constraint bravo_transactions_source_unique unique (user_id, source_key)
);

create table if not exists public.study_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  validation_status text not null check (validation_status in ('accepted', 'flagged')),
  risk_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint study_sync_logs_session_unique unique (user_id, session_id)
);

create index if not exists study_documents_metadata_user_updated_idx
  on public.study_documents_metadata (user_id, updated_at desc);
create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);
create index if not exists study_sessions_user_accepted_started_idx
  on public.study_sessions (user_id, started_at desc)
  where validation_status = 'accepted';
create index if not exists daily_streak_registry_user_date_idx
  on public.daily_streak_registry (user_id, study_date desc);
create index if not exists bravo_transactions_user_created_idx
  on public.bravo_transactions (user_id, created_at desc);

alter table public.study_documents_metadata enable row level security;
alter table public.study_sessions enable row level security;
alter table public.weekly_bravo_balances enable row level security;
alter table public.daily_streak_registry enable row level security;
alter table public.weekly_document_activity enable row level security;
alter table public.bravo_transactions enable row level security;
alter table public.study_sync_logs enable row level security;

drop policy if exists "Students read their own study material metadata" on public.study_documents_metadata;
create policy "Students read their own study material metadata"
on public.study_documents_metadata for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students add their own study material metadata" on public.study_documents_metadata;
create policy "Students add their own study material metadata"
on public.study_documents_metadata for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Students update their own study material metadata" on public.study_documents_metadata;
create policy "Students update their own study material metadata"
on public.study_documents_metadata for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Students delete their own study material metadata" on public.study_documents_metadata;

drop policy if exists "Students read their own study sessions" on public.study_sessions;
create policy "Students read their own study sessions"
on public.study_sessions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students read their own weekly Bravo balance" on public.weekly_bravo_balances;
create policy "Students read their own weekly Bravo balance"
on public.weekly_bravo_balances for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students read their own daily study streaks" on public.daily_streak_registry;
create policy "Students read their own daily study streaks"
on public.daily_streak_registry for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Students read their own Bravo transactions" on public.bravo_transactions;
create policy "Students read their own Bravo transactions"
on public.bravo_transactions for select to authenticated
using (user_id = (select auth.uid()));

-- The per-document award ledger and sync diagnostics are server-only. RLS is
-- enabled without client policies or table grants.

revoke all on table public.study_documents_metadata, public.study_sessions,
  public.weekly_bravo_balances, public.daily_streak_registry,
  public.weekly_document_activity, public.bravo_transactions,
  public.study_sync_logs from public, anon, authenticated;
grant select, insert, update on public.study_documents_metadata to authenticated;
grant select on public.study_sessions, public.weekly_bravo_balances,
  public.daily_streak_registry, public.bravo_transactions to authenticated;
grant usage on schema public to authenticated;

create or replace function public.sync_study_sessions(p_sessions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_session_id uuid;
  v_document_id uuid;
  v_started_at timestamptz;
  v_requested_end timestamptz;
  v_ended_at timestamptz;
  v_active_seconds integer;
  v_interaction_count integer;
  v_pages_viewed integer;
  v_duration_seconds numeric;
  v_week_start date;
  v_study_date date;
  v_status text;
  v_flags text[];
  v_inserted_id uuid;
  v_existing_status text;
  v_accepted_ids uuid[] := array[]::uuid[];
  v_flagged_ids uuid[] := array[]::uuid[];
  v_awarded integer := 0;
  v_award integer;
  v_old_study_bravos integer;
  v_study_bravos integer;
  v_document_bravos integer;
  v_consistency_bravos integer;
  v_document_seconds bigint;
  v_document_rewarded boolean;
  v_day_seconds bigint;
  v_day_qualifies boolean;
  v_day_rewarded boolean;
begin
  if v_user_id is null then
    raise exception 'A signed-in user is required.' using errcode = '42501';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array'
    or jsonb_array_length(p_sessions) > 25 then
    raise exception 'Sync between 0 and 25 study sessions per request.' using errcode = '22023';
  end if;

  -- Serialize this user's syncs so parallel sessions and simultaneous rewards
  -- cannot bypass overlap detection or weekly limits.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text)::bigint);

  for v_item in
    select value
    from jsonb_array_elements(p_sessions) as item(value)
    order by (value ->> 'started_at')::timestamptz nulls last
  loop
    if coalesce(v_item ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v_item ->> 'document_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or nullif(v_item ->> 'started_at', '') is null
      or nullif(v_item ->> 'ended_at', '') is null then
      raise exception 'A study session is missing a valid ID, document, or timestamp.' using errcode = '22023';
    end if;

    v_session_id := (v_item ->> 'id')::uuid;
    v_document_id := (v_item ->> 'document_id')::uuid;
    v_started_at := (v_item ->> 'started_at')::timestamptz;
    v_requested_end := (v_item ->> 'ended_at')::timestamptz;
    v_active_seconds := coalesce((v_item ->> 'active_seconds')::integer, 0);
    v_interaction_count := coalesce((v_item ->> 'interaction_count')::integer, 0);
    v_pages_viewed := coalesce((v_item ->> 'pages_viewed')::integer, 0);

    if v_active_seconds < 0 or v_active_seconds > 86400
      or v_interaction_count < 0 or v_pages_viewed < 0 then
      raise exception 'A study session contains invalid counters.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.study_documents_metadata as document
      where document.id = v_document_id and document.user_id = v_user_id
    ) then
      raise exception 'Sync the material metadata before its study session.' using errcode = '42501';
    end if;

    -- Repeated syncs are safe: return the server's original decision without
    -- creating another session or awarding points again.
    v_inserted_id := null;
    insert into public.study_sessions (
      id, user_id, document_id, started_at, ended_at, active_seconds,
      interaction_count, pages_viewed, validation_status, risk_flags
    ) values (
      v_session_id, v_user_id, v_document_id, v_started_at,
      greatest(v_started_at, v_requested_end), v_active_seconds,
      v_interaction_count, v_pages_viewed, 'flagged', array[]::text[]
    ) on conflict (id) do nothing
    returning id into v_inserted_id;

    if v_inserted_id is null then
      select session.validation_status into v_existing_status
      from public.study_sessions as session
      where session.id = v_session_id and session.user_id = v_user_id;
      if not found then
        raise exception 'This study session ID is already in use.' using errcode = '42501';
      end if;
      if v_existing_status = 'accepted' then
        v_accepted_ids := array_append(v_accepted_ids, v_session_id);
      else
        v_flagged_ids := array_append(v_flagged_ids, v_session_id);
      end if;
      continue;
    end if;

    v_ended_at := greatest(v_started_at, v_requested_end);
    v_duration_seconds := extract(epoch from (v_ended_at - v_started_at));
    v_flags := array[]::text[];

    if v_requested_end < v_started_at then
      v_flags := array_append(v_flags, 'end_before_start');
    end if;
    if v_started_at > now() + interval '5 minutes' or v_requested_end > now() + interval '5 minutes' then
      v_flags := array_append(v_flags, 'future_timestamp');
    end if;
    if v_started_at < now() - interval '30 days' then
      v_flags := array_append(v_flags, 'outside_sync_window');
    end if;
    if v_active_seconds > v_duration_seconds + 5 then
      v_flags := array_append(v_flags, 'active_time_exceeds_session');
    end if;
    if v_active_seconds > 14400 then
      v_flags := array_append(v_flags, 'session_over_four_hours');
    end if;
    if v_interaction_count > 5000 then
      v_flags := array_append(v_flags, 'interaction_count_outlier');
    end if;
    if v_pages_viewed > 10000 then
      v_flags := array_append(v_flags, 'page_count_outlier');
    end if;
    if exists (
      select 1 from public.study_sessions as prior
      where prior.user_id = v_user_id
        and prior.validation_status = 'accepted'
        and prior.started_at < v_ended_at
        and prior.ended_at > v_started_at
    ) then
      v_flags := array_append(v_flags, 'overlapping_session');
    end if;

    v_status := case when cardinality(v_flags) = 0 then 'accepted' else 'flagged' end;
    update public.study_sessions as session
    set validation_status = v_status,
        risk_flags = v_flags,
        synced_at = now()
    where session.id = v_session_id and session.user_id = v_user_id;

    insert into public.study_sync_logs (user_id, session_id, validation_status, risk_flags)
    values (v_user_id, v_session_id, v_status, v_flags)
    on conflict (user_id, session_id) do nothing;

    if v_status = 'flagged' then
      v_flagged_ids := array_append(v_flagged_ids, v_session_id);
      continue;
    end if;

    v_accepted_ids := array_append(v_accepted_ids, v_session_id);
    v_week_start := date_trunc('week', v_started_at at time zone 'Africa/Addis_Ababa')::date;
    v_study_date := (v_started_at at time zone 'Africa/Addis_Ababa')::date;

    insert into public.weekly_bravo_balances (user_id, week_start)
    values (v_user_id, v_week_start)
    on conflict (user_id, week_start) do nothing;
    select balance.study_bravos, balance.unique_document_bravos, balance.consistency_bravos
    into v_old_study_bravos, v_document_bravos, v_consistency_bravos
    from public.weekly_bravo_balances as balance
    where balance.user_id = v_user_id and balance.week_start = v_week_start
    for update;

    update public.weekly_bravo_balances as balance
    set study_seconds = balance.study_seconds + v_active_seconds,
        study_bravos = least(50, ((balance.study_seconds + v_active_seconds) / 600)::integer),
        total_bravos = least(
          100,
          least(50, ((balance.study_seconds + v_active_seconds) / 600)::integer)
            + balance.unique_document_bravos + balance.consistency_bravos
        ),
        updated_at = now()
    where balance.user_id = v_user_id and balance.week_start = v_week_start
    returning balance.study_bravos into v_study_bravos;
    v_award := greatest(0, v_study_bravos - v_old_study_bravos);
    if v_award > 0 then
      insert into public.bravo_transactions (user_id, week_start, category, source_key, description, amount)
      values (v_user_id, v_week_start, 'study_time', 'study-session:' || v_session_id::text,
        'Focused study time', v_award)
      on conflict (user_id, source_key) do nothing;
      v_awarded := v_awarded + v_award;
    end if;

    insert into public.weekly_document_activity (user_id, week_start, document_id, active_seconds)
    values (v_user_id, v_week_start, v_document_id, v_active_seconds)
    on conflict (user_id, week_start, document_id) do update
      set active_seconds = public.weekly_document_activity.active_seconds + excluded.active_seconds
    returning active_seconds, unique_rewarded into v_document_seconds, v_document_rewarded;

    if v_document_seconds >= 900 and not v_document_rewarded then
      v_award := least(2, greatest(0, 30 - v_document_bravos));
      update public.weekly_document_activity as activity
      set unique_rewarded = true
      where activity.user_id = v_user_id
        and activity.week_start = v_week_start
        and activity.document_id = v_document_id;
      if v_award > 0 then
        update public.weekly_bravo_balances as balance
        set unique_document_bravos = balance.unique_document_bravos + v_award,
            total_bravos = balance.study_bravos + balance.unique_document_bravos + v_award + balance.consistency_bravos,
            updated_at = now()
        where balance.user_id = v_user_id and balance.week_start = v_week_start;
        v_document_bravos := v_document_bravos + v_award;
        insert into public.bravo_transactions (user_id, week_start, category, source_key, description, amount)
        values (v_user_id, v_week_start, 'unique_document',
          'document:' || v_week_start::text || ':' || v_document_id::text,
          'Studied a new material', v_award)
        on conflict (user_id, source_key) do nothing;
        v_awarded := v_awarded + v_award;
      end if;
    end if;

    insert into public.daily_streak_registry (user_id, study_date, active_seconds)
    values (v_user_id, v_study_date, v_active_seconds)
    on conflict (user_id, study_date) do update
      set active_seconds = public.daily_streak_registry.active_seconds + excluded.active_seconds,
          qualifying = (public.daily_streak_registry.active_seconds + excluded.active_seconds) >= 900
    returning active_seconds, qualifying, consistency_rewarded
      into v_day_seconds, v_day_qualifies, v_day_rewarded;

    if v_day_qualifies and not v_day_rewarded then
      v_award := least(4, greatest(0, 20 - v_consistency_bravos));
      update public.daily_streak_registry as day
      set consistency_rewarded = true
      where day.user_id = v_user_id and day.study_date = v_study_date;
      if v_award > 0 then
        update public.weekly_bravo_balances as balance
        set consistency_bravos = balance.consistency_bravos + v_award,
            total_bravos = balance.study_bravos + balance.unique_document_bravos + balance.consistency_bravos + v_award,
            updated_at = now()
        where balance.user_id = v_user_id and balance.week_start = v_week_start;
        v_consistency_bravos := v_consistency_bravos + v_award;
        insert into public.bravo_transactions (user_id, week_start, category, source_key, description, amount)
        values (v_user_id, v_week_start, 'daily_consistency',
          'consistency:' || v_study_date::text,
          'Daily study consistency', v_award)
        on conflict (user_id, source_key) do nothing;
        v_awarded := v_awarded + v_award;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'accepted_session_ids', to_jsonb(v_accepted_ids),
    'flagged_session_ids', to_jsonb(v_flagged_ids),
    'awarded_bravos', v_awarded
  );
end;
$$;

create or replace function public.get_bravo_wallet()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_week_start date := date_trunc('week', now() at time zone 'Africa/Addis_Ababa')::date;
  v_wallet jsonb;
begin
  if v_user_id is null then
    raise exception 'A signed-in user is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'cycle_start', v_week_start,
    'cycle_ends_at', v_week_start + 7,
    'study_seconds', coalesce(balance.study_seconds, 0),
    'study_bravos', coalesce(balance.study_bravos, 0),
    'unique_document_bravos', coalesce(balance.unique_document_bravos, 0),
    'consistency_bravos', coalesce(balance.consistency_bravos, 0),
    'total_bravos', coalesce(balance.total_bravos, 0),
    'weekly_cap', 100,
    'recent_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'category', recent.category,
        'description', recent.description,
        'amount', recent.amount,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select transaction.id, transaction.category, transaction.description,
          transaction.amount, transaction.created_at
        from public.bravo_transactions as transaction
        where transaction.user_id = v_user_id and transaction.week_start = v_week_start
        order by transaction.created_at desc
        limit 20
      ) as recent
    ), '[]'::jsonb)
  ) into v_wallet
  from (select 1) as singleton
  left join public.weekly_bravo_balances as balance
    on balance.user_id = v_user_id and balance.week_start = v_week_start;

  return v_wallet;
end;
$$;

revoke all on function public.sync_study_sessions(jsonb) from public, anon, authenticated;
grant execute on function public.sync_study_sessions(jsonb) to authenticated;
revoke all on function public.get_bravo_wallet() from public, anon, authenticated;
grant execute on function public.get_bravo_wallet() to authenticated;

commit;
