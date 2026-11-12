-- Administrator-only RPCs for creating, editing, and scheduling examinations.

begin;

create or replace function public.admin_save_examination(p_exam jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam_id uuid;
  v_competition_id uuid;
  v_course_id uuid;
  v_exam_type text;
  v_week_number integer;
  v_title text;
  v_question_count integer;
  v_seconds_per_question integer;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
  v_reconnect_grace_seconds integer;
  v_allow_previous_navigation boolean;
  v_competition_type text;
  v_course_active boolean;
  v_existing_status text;
begin
  if (select auth.uid()) is null
    or not (select public.has_role((select auth.uid()), 'admin')) then
    raise exception using errcode = '42501', message = 'Administrator access is required to save examinations.';
  end if;

  if p_exam is null or pg_catalog.jsonb_typeof(p_exam) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Examination data must be a JSON object.';
  end if;

  if p_exam - array[
    'id',
    'competition_id',
    'course_id',
    'exam_type',
    'week_number',
    'title',
    'question_count',
    'seconds_per_question',
    'opens_at',
    'closes_at',
    'reconnect_grace_seconds',
    'allow_previous_navigation'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Examination data contains unsupported fields.';
  end if;

  if not (p_exam ?& array[
    'competition_id',
    'course_id',
    'exam_type',
    'week_number',
    'title',
    'question_count',
    'seconds_per_question',
    'opens_at',
    'closes_at',
    'reconnect_grace_seconds',
    'allow_previous_navigation'
  ]) then
    raise exception using errcode = '22023', message = 'Required examination fields are missing.';
  end if;

  if (p_exam ? 'id')
    and pg_catalog.jsonb_typeof(p_exam -> 'id') is distinct from 'string'
    and pg_catalog.jsonb_typeof(p_exam -> 'id') is distinct from 'null' then
    raise exception using errcode = '22023', message = 'Examination id must be a UUID string or null.';
  end if;

  if pg_catalog.jsonb_typeof(p_exam -> 'competition_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'course_id') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'exam_type') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'title') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'opens_at') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'closes_at') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_exam -> 'question_count') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_exam -> 'seconds_per_question') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_exam -> 'reconnect_grace_seconds') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_exam -> 'allow_previous_navigation') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_exam -> 'week_number') not in ('number', 'null') then
    raise exception using errcode = '22023', message = 'Examination fields have invalid JSON types.';
  end if;

  if (p_exam ->> 'question_count') !~ '^[0-9]+$'
    or (p_exam ->> 'seconds_per_question') !~ '^[0-9]+$'
    or (p_exam ->> 'reconnect_grace_seconds') !~ '^[0-9]+$'
    or (p_exam ->> 'week_number') is not null
      and (p_exam ->> 'week_number') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'Examination numeric fields must be whole numbers.';
  end if;

  v_exam_id := nullif(pg_catalog.btrim(p_exam ->> 'id'), '')::uuid;
  v_competition_id := nullif(pg_catalog.btrim(p_exam ->> 'competition_id'), '')::uuid;
  v_course_id := nullif(pg_catalog.btrim(p_exam ->> 'course_id'), '')::uuid;
  v_exam_type := p_exam ->> 'exam_type';
  v_week_number := nullif(p_exam ->> 'week_number', '')::integer;
  v_title := pg_catalog.btrim(p_exam ->> 'title');
  v_question_count := (p_exam ->> 'question_count')::integer;
  v_seconds_per_question := (p_exam ->> 'seconds_per_question')::integer;
  v_opens_at := (p_exam ->> 'opens_at')::timestamptz;
  v_closes_at := (p_exam ->> 'closes_at')::timestamptz;
  v_reconnect_grace_seconds := (p_exam ->> 'reconnect_grace_seconds')::integer;
  v_allow_previous_navigation := (p_exam ->> 'allow_previous_navigation')::boolean;

  if v_competition_id is null or v_course_id is null then
    raise exception using errcode = '22023', message = 'A competition and course are required.';
  end if;
  if v_exam_type not in ('weekly_arena', 'grand_weekly', 'grand_final') then
    raise exception using errcode = '22023', message = 'Examination type is invalid.';
  end if;
  if pg_catalog.char_length(v_title) not between 3 and 140 then
    raise exception using errcode = '22023', message = 'Examination title must contain 3 to 140 characters.';
  end if;
  if v_question_count not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Question count must be between 1 and 100.';
  end if;
  if v_seconds_per_question not between 30 and 45 then
    raise exception using errcode = '22023', message = 'Seconds per question must be between 30 and 45.';
  end if;
  if v_reconnect_grace_seconds not between 0 and 900 then
    raise exception using errcode = '22023', message = 'Reconnect grace must be between 0 and 900 seconds.';
  end if;
  if v_exam_type = 'grand_weekly' then
    if v_week_number is null or v_week_number not between 1 and 8 then
      raise exception using errcode = '22023', message = 'Grand weekly examinations require a week number from 1 to 8.';
    end if;
  elsif v_week_number is not null then
    raise exception using errcode = '22023', message = 'Week number is only valid for grand weekly examinations.';
  end if;
  if not pg_catalog.isfinite(v_opens_at)
    or not pg_catalog.isfinite(v_closes_at)
    or v_closes_at <= v_opens_at then
    raise exception using errcode = '22023', message = 'Examination close time must be after its open time.';
  end if;

  select competition.competition_type
  into v_competition_type
  from public.competitions as competition
  where competition.id = v_competition_id
  for key share;

  if not found then
    raise exception using errcode = '22023', message = 'The selected competition does not exist.';
  end if;
  if (v_exam_type = 'weekly_arena' and v_competition_type <> 'weekly_arena')
    or (v_exam_type in ('grand_weekly', 'grand_final') and v_competition_type <> 'grand_milestone') then
    raise exception using errcode = '22023', message = 'Examination type does not match the selected competition.';
  end if;

  select course.active
  into v_course_active
  from public.courses as course
  where course.id = v_course_id
  for key share;

  if not found or not v_course_active then
    raise exception using errcode = '22023', message = 'The selected course does not exist or is inactive.';
  end if;

  if v_exam_id is null then
    insert into public.examinations (
      competition_id,
      course_id,
      exam_type,
      week_number,
      title,
      question_count,
      seconds_per_question,
      opens_at,
      closes_at,
      reconnect_grace_seconds,
      allow_previous_navigation,
      status,
      created_by
    )
    values (
      v_competition_id,
      v_course_id,
      v_exam_type,
      v_week_number::smallint,
      v_title,
      v_question_count::smallint,
      v_seconds_per_question::smallint,
      v_opens_at,
      v_closes_at,
      v_reconnect_grace_seconds::smallint,
      v_allow_previous_navigation,
      'draft',
      (select auth.uid())
    )
    returning id into v_exam_id;
  else
    select examination.status
    into v_existing_status
    from public.examinations as examination
    where examination.id = v_exam_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Examination to update was not found.';
    end if;
    if v_existing_status <> 'draft' then
      raise exception using errcode = '55000', message = 'Only draft examinations can be edited.';
    end if;
    if exists (
      select 1
      from public.examination_sessions as session
      where session.examination_id = v_exam_id
    ) then
      raise exception using errcode = '55000', message = 'An examination with sessions cannot be edited.';
    end if;

    update public.examinations as examination
    set competition_id = v_competition_id,
        course_id = v_course_id,
        exam_type = v_exam_type,
        week_number = v_week_number::smallint,
        title = v_title,
        question_count = v_question_count::smallint,
        seconds_per_question = v_seconds_per_question::smallint,
        opens_at = v_opens_at,
        closes_at = v_closes_at,
        reconnect_grace_seconds = v_reconnect_grace_seconds::smallint,
        allow_previous_navigation = v_allow_previous_navigation,
        updated_at = pg_catalog.clock_timestamp()
    where examination.id = v_exam_id;
  end if;

  return v_exam_id;
end;
$$;

create or replace function public.admin_set_exam_status(p_exam_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
  v_now timestamptz;
begin
  if (select auth.uid()) is null
    or not (select public.has_role((select auth.uid()), 'admin')) then
    raise exception using errcode = '42501', message = 'Administrator access is required to update examination status.';
  end if;
  if p_exam_id is null or p_status is null or p_status not in ('scheduled', 'open', 'closed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Examination id or target status is invalid.';
  end if;

  select examination.status, examination.opens_at, examination.closes_at
  into v_current_status, v_opens_at, v_closes_at
  from public.examinations as examination
  where examination.id = p_exam_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination was not found.';
  end if;
  if v_current_status = p_status then
    return;
  end if;

  if not (
    (v_current_status = 'draft' and p_status in ('scheduled', 'cancelled'))
    or (v_current_status = 'scheduled' and p_status in ('open', 'closed', 'cancelled'))
    or (v_current_status = 'open' and p_status = 'closed')
  ) then
    raise exception using errcode = '55000', message = 'This examination status transition is not allowed.';
  end if;

  if p_status = 'open' then
    v_now := pg_catalog.clock_timestamp();
    if v_now < v_opens_at or v_now >= v_closes_at then
      raise exception using errcode = '55000', message = 'Examination can only be opened during its scheduled window.';
    end if;
  end if;

  update public.examinations as examination
  set status = p_status,
      updated_at = pg_catalog.clock_timestamp()
  where examination.id = p_exam_id;
end;
$$;

revoke all on function public.admin_save_examination(jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_exam_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_save_examination(jsonb) to authenticated;
grant execute on function public.admin_set_exam_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';

do $$
begin
  if to_regprocedure('public.admin_save_examination(jsonb)') is null
    or to_regprocedure('public.admin_set_exam_status(uuid, text)') is null then
    raise exception 'Examination administrator RPCs were not created. Check the preceding migration errors.';
  end if;
end
$$;

commit;