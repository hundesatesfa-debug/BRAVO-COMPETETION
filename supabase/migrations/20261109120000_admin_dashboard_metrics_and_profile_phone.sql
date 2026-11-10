-- Align the profile contact column with the application schema and provide the
-- administrator-only aggregate RPC consumed by AdminOverview.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Cannot normalize profile contact data: public.profiles does not exist.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_number'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone'
  ) then
    alter table public.profiles rename column phone_number to phone;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone'
  ) then
    raise exception 'Cannot normalize profile contact data: public.profiles has neither phone nor phone_number.';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_phone_number_ethiopian_mobile_check'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_phone_ethiopian_mobile_check'
  ) then
    alter table public.profiles
      rename constraint profiles_phone_number_ethiopian_mobile_check
      to profiles_phone_ethiopian_mobile_check;
  end if;
end
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
  requested_cbe_account text := trim(coalesce(new.raw_user_meta_data ->> 'cbe_account_number', ''));
  requested_school text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'school_name', '')), '');
  requested_university text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'university', '')), '');
  requested_department text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'department', '')), '');
  requested_year_text text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'academic_year', '')), '');
  requested_student_id text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_id', '')), '');
  requested_year smallint;
begin
  if char_length(requested_name) not between 1 and 100 then
    raise exception 'Please enter a valid full name.';
  end if;
  if requested_level not in ('grade_12', 'freshman') then
    raise exception 'Please select a valid academic level.';
  end if;
  if requested_stream is not null and requested_stream not in ('natural_science', 'social_science') then
    raise exception 'Please select a valid academic stream.';
  end if;
  if requested_level = 'grade_12' and (requested_school is null or char_length(requested_school) not between 2 and 150) then
    raise exception 'Please enter a valid school name.';
  end if;
  if requested_level = 'freshman' then
    requested_school := null;
  end if;
  if requested_university is not null and char_length(requested_university) not between 2 and 150 then
    raise exception 'Please enter a valid university name.';
  end if;
  if requested_department is not null and char_length(requested_department) not between 2 and 120 then
    raise exception 'Please enter a valid department.';
  end if;
  if requested_year_text is not null and requested_year_text !~ '^[1-8]$' then
    raise exception 'Academic year must be between 1 and 8.';
  end if;
  if requested_year_text is not null then
    requested_year := requested_year_text::smallint;
  end if;
  if requested_student_id is not null and char_length(requested_student_id) not between 1 and 80 then
    raise exception 'Student ID must be 80 characters or fewer.';
  end if;
  if requested_phone is not null and requested_phone !~ '^\+251[79][0-9]{8}$' then
    raise exception 'Please enter a valid Ethiopian mobile number.';
  end if;
  if requested_cbe_account !~ '^[0-9]{13}$' then
    raise exception 'Please enter a valid 13-digit CBE account number.';
  end if;

  insert into public.profiles (
    id, full_name, academic_level, stream, phone, cbe_account_number, school_name,
    university, department, academic_year, student_id
  )
  values (
    new.id, requested_name, requested_level, requested_stream, requested_phone,
    requested_cbe_account, requested_school, requested_university, requested_department,
    requested_year, requested_student_id
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.user_roles') is null
    or to_regclass('public.competitions') is null
    or to_regclass('public.competition_registrations') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.payouts') is null
    or to_regclass('public.audit_logs') is null then
    raise exception 'Cannot create admin_dashboard_metrics: apply the BRAVO competition, payment, payout, and audit schema first.';
  end if;
end
$$;

alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.payments, public.payouts, public.audit_logs to authenticated;

drop policy if exists "Administrators can read all payments" on public.payments;
create policy "Administrators can read all payments"
on public.payments for select
to authenticated
using ((select public.has_role('admin')));

drop policy if exists "Administrators can read all payouts" on public.payouts;
create policy "Administrators can read all payouts"
on public.payouts for select
to authenticated
using ((select public.has_role('admin')));

drop policy if exists "Administrators can read audit logs" on public.audit_logs;
create policy "Administrators can read audit logs"
on public.audit_logs for select
to authenticated
using ((select public.has_role('admin')));

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  total_students bigint;
  active_students bigint;
  weekly_participants bigint;
  grand_participants bigint;
  pending_payments bigint;
  verified_payments bigint;
  gross_verified_revenue_etb numeric;
  reward_liabilities_etb numeric;
  pending_payouts bigint;
  recent_activity jsonb;
begin
  if (select auth.uid()) is null or not (select public.has_role('admin')) then
    raise exception 'Administrator access is required to view dashboard metrics.'
      using errcode = '42501';
  end if;

  select count(distinct role_row.user_id)
  into total_students
  from public.user_roles as role_row
  where role_row.role::text = 'student';

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'account_status'
  ) then
    execute
      'select count(distinct role_row.user_id)
       from public.user_roles as role_row
       join public.profiles as profile on profile.id = role_row.user_id
       where role_row.role::text = ''student''
         and profile.account_status = ''active'''
    into active_students;
  else
    active_students := total_students;
  end if;

  select
    count(distinct registration.user_id) filter (where competition.competition_type = 'weekly_arena'),
    count(distinct registration.user_id) filter (where competition.competition_type = 'grand_milestone')
  into weekly_participants, grand_participants
  from public.competition_registrations as registration
  join public.competitions as competition on competition.id = registration.competition_id
  where registration.status not in ('withdrawn', 'rejected', 'refunded');

  select
    count(*) filter (where payment.status = 'pending'),
    count(*) filter (where payment.status = 'verified'),
    coalesce(sum(payment.amount_etb) filter (where payment.status = 'verified'), 0)
  into pending_payments, verified_payments, gross_verified_revenue_etb
  from public.payments as payment;

  select
    coalesce(sum(payout.amount_etb) filter (where payout.status in ('pending', 'processing', 'failed')), 0),
    count(*) filter (where payout.status = 'pending')
  into reward_liabilities_etb, pending_payouts
  from public.payouts as payout;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', recent.id,
        'action', recent.action,
        'entity_type', recent.entity_type,
        'actor_name', recent.actor_name,
        'created_at', recent.created_at
      )
      order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into recent_activity
  from (
    select
      audit.id,
      audit.action,
      audit.entity_type,
      case when actor_role.user_id is not null then profile.full_name end as actor_name,
      audit.created_at
    from public.audit_logs as audit
    left join public.profiles as profile on profile.id = audit.actor_id
    left join public.user_roles as actor_role
      on actor_role.user_id = audit.actor_id and actor_role.role::text = 'admin'
    order by audit.created_at desc
    limit 5
  ) as recent;

  return jsonb_build_object(
    'total_students', total_students,
    'active_students', active_students,
    'weekly_participants', weekly_participants,
    'grand_participants', grand_participants,
    'pending_payments', pending_payments,
    'verified_payments', verified_payments,
    'gross_verified_revenue_etb', gross_verified_revenue_etb,
    'reward_liabilities_etb', reward_liabilities_etb,
    'pending_payouts', pending_payouts,
    'recent_activity', recent_activity
  );
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon;
grant usage on schema public to authenticated;
grant execute on function public.admin_dashboard_metrics() to authenticated;

notify pgrst, 'reload schema';

do $$
begin
  if to_regprocedure('public.admin_dashboard_metrics()') is null then
    raise exception 'admin_dashboard_metrics() was not created. Check the preceding migration errors.';
  end if;
end
$$;
