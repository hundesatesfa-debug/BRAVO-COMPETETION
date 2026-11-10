-- Server-owned examination sessions, scoring, and student feed.
-- The examination tables are created by the existing Phase 3-6 schema setup.

begin;

do $$
begin
  if to_regclass('public.examinations') is null
    or to_regclass('public.question_bank') is null
    or to_regclass('public.competition_registrations') is null
    or to_regclass('public.examination_sessions') is null
    or to_regclass('public.examination_questions') is null
    or to_regclass('public.examination_answers') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.courses') is null
    or to_regclass('public.competitions') is null then
    raise exception 'Apply the existing BR@VO examination schema before this migration.';
  end if;

  if to_regprocedure('public.has_role(uuid, text)') is null then
    raise exception 'Required authorization helper public.has_role(uuid, text) is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'account_status'
  ) then
    raise exception 'Required public.profiles.account_status column is missing.';
  end if;
end
$$;

-- Existing answer keys are historical snapshot data. The current question
-- bank is mutable, so its present-day keys cannot safely reconstruct missing
-- historical keys.
alter table public.examination_questions
  add column if not exists correct_choice_id text;

do $$
declare
  v_missing_snapshot_keys bigint;
begin
  select count(*)
  into v_missing_snapshot_keys
  from public.examination_questions
  where correct_choice_id is null;

  if v_missing_snapshot_keys > 0 then
    raise exception
      'Cannot safely add examination answer keys: % existing snapshot(s) have no stored correct_choice_id. The current question_bank key may differ from the historical key; recover original keys from an authoritative source before retrying.',
      v_missing_snapshot_keys;
  end if;
end
$$;

alter table public.examination_questions
  alter column correct_choice_id set not null;

alter table public.question_bank enable row level security;
alter table public.examination_sessions enable row level security;
alter table public.examination_questions enable row level security;
alter table public.examination_answers enable row level security;

-- Question keys remain available to administrators only. The restrictive
-- policy also prevents any older permissive policy from exposing them.
revoke all on table public.question_bank from public, anon, authenticated;
grant select, insert, update, delete on table public.question_bank to authenticated;

drop policy if exists bravo_question_bank_admin_access on public.question_bank;
create policy bravo_question_bank_admin_access
on public.question_bank
for all
to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

drop policy if exists bravo_question_bank_admin_guard on public.question_bank;
create policy bravo_question_bank_admin_guard
on public.question_bank
as restrictive
for all
to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

-- Keep the existing administrator monitoring SELECT working, while removing
-- all direct student access and all direct client writes to session data.
revoke all on table public.examination_sessions,
  public.examination_questions, public.examination_answers
from public, anon, authenticated;
grant select on table public.examination_sessions to authenticated;

drop policy if exists bravo_examination_sessions_admin_read on public.examination_sessions;
create policy bravo_examination_sessions_admin_read
on public.examination_sessions
for select
to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

drop policy if exists bravo_examination_sessions_admin_guard on public.examination_sessions;
create policy bravo_examination_sessions_admin_guard
on public.examination_sessions
as restrictive
for select
to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

create or replace function public.get_student_exam_feed()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_exams jsonb;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to view examinations.';
  end if;

  select exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot access examinations.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', feed.id,
        'title', feed.title,
        'exam_type', feed.exam_type,
        'week_number', feed.week_number,
        'question_count', feed.question_count,
        'seconds_per_question', feed.seconds_per_question,
        'opens_at', feed.opens_at,
        'closes_at', feed.closes_at,
        'allow_previous_navigation', feed.allow_previous_navigation,
        'window_open', feed.window_open,
        'session_id', feed.session_id,
        'session_status', feed.session_status,
        'score', feed.score,
        'course_id', feed.course_id,
        'course_code', feed.course_code,
        'course_title', feed.course_title,
        'course', pg_catalog.jsonb_build_object(
          'id', feed.course_id, 'code', feed.course_code, 'title', feed.course_title
        ),
        'competition_id', feed.competition_id,
        'competition_title', feed.competition_title,
        'competition', pg_catalog.jsonb_build_object(
          'id', feed.competition_id, 'title', feed.competition_title
        ),
        'registration_id', feed.registration_id,
        'registration_status', feed.registration_status,
        'registration', pg_catalog.jsonb_build_object(
          'id', feed.registration_id, 'status', feed.registration_status
        )
      )
      order by feed.opens_at desc, feed.id
    ),
    '[]'::jsonb
  )
  into v_exams
  from (
    select
      e.id,
      e.title,
      e.exam_type,
      e.week_number,
      e.question_count,
      e.seconds_per_question,
      e.opens_at,
      e.closes_at,
      e.allow_previous_navigation,
      c.id as course_id,
      c.code as course_code,
      c.title as course_title,
      co.id as competition_id,
      co.title as competition_title,
      r.id as registration_id,
      r.status as registration_status,
      s.id as session_id,
      s.status as session_status,
      case when s.status in ('submitted', 'expired') then s.score else null end as score,
      (
        r.status = 'eligible'
        and (
          s.status = 'in_progress'
          or (
            e.status in ('scheduled', 'open')
            and v_now >= e.opens_at
            and v_now + (
              e.question_count::integer * e.seconds_per_question::integer
            ) * interval '1 second' <= e.closes_at
          )
        )
      ) as window_open
    from public.examinations as e
    join public.courses as c on c.id = e.course_id
    join public.competitions as co on co.id = e.competition_id
    join public.competition_registrations as r
      on r.competition_id = e.competition_id
      and r.user_id = v_user_id
    left join public.examination_sessions as s
      on s.examination_id = e.id
      and s.registration_id = r.id
      and s.user_id = v_user_id
    where e.status in ('scheduled', 'open', 'closed')
      and co.status = 'published'
  ) as feed;

  -- Keep both historical response keys while the current web client consumes
  -- the examinations array.
  return pg_catalog.jsonb_build_object(
    'examinations', v_exams,
    'exams', v_exams
  );
end;
$$;

create or replace function public.get_examination_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.examination_sessions%rowtype;
  v_registration_status text;
  v_examination_status text;
  v_competition_status text;
  v_reconnect_grace_seconds integer;
  v_now timestamptz;
  v_correct_count integer;
  v_result jsonb;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to access an examination session.';
  end if;

  select exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot access examination sessions.';
  end if;

  select s, r.status, e.status, co.status, e.reconnect_grace_seconds
  into v_session, v_registration_status, v_examination_status,
    v_competition_status, v_reconnect_grace_seconds
  from public.examination_sessions as s
  join public.competition_registrations as r
    on r.id = s.registration_id
    and r.user_id = s.user_id
  join public.examinations as e
    on e.id = s.examination_id
    and e.competition_id = r.competition_id
  join public.competitions as co on co.id = e.competition_id
  where s.id = p_session_id
    and s.user_id = v_user_id
  for update of s;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination session was not found for the authenticated user.';
  end if;
  if v_competition_status <> 'published' then
    raise exception using errcode = '55000', message = 'The competition is not published.';
  end if;

  v_now := pg_catalog.clock_timestamp();

  if v_session.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'This examination session has been cancelled.';
  end if;

  if v_examination_status = 'cancelled' and v_session.status = 'in_progress' then
    raise exception using errcode = '55000', message = 'This examination has been cancelled.';
  end if;

  if v_session.status = 'in_progress' then
    if v_registration_status <> 'eligible' then
      raise exception using errcode = '42501', message = 'An eligible competition registration is required to continue this examination.';
    end if;
    if v_examination_status = 'draft' then
      raise exception using errcode = '55000', message = 'This examination is not available.';
    end if;

    if v_now > v_session.deadline_at
      + (v_reconnect_grace_seconds * interval '1 second') then
      select count(*)::integer
      into v_correct_count
      from public.examination_answers as a
      join public.examination_questions as q
        on q.session_id = a.session_id and q.position = a.position
      where a.session_id = v_session.id
        and a.selected_choice_id = q.correct_choice_id;

      update public.examination_sessions as s
      set status = 'expired',
          submitted_at = v_now,
          correct_count = v_correct_count,
          score = pg_catalog.round(
            v_correct_count::numeric * 100 / v_session.total_questions,
            2
          )
      where s.id = v_session.id
      returning s.* into v_session;
    end if;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'started_at', v_session.started_at,
    'deadline_at', v_session.deadline_at,
    'server_now', v_now,
    'total_questions', v_session.total_questions,
    'questions', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'position', q.position,
            'starts_at', q.question_starts_at,
            'deadline_at', q.question_deadline_at,
            'prompt', q.prompt_snapshot,
            'choices', (
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', choice.value ->> 'id',
                  'text', choice.value ->> 'text'
                )
                order by choice.ordinality
              )
              from pg_catalog.jsonb_array_elements(q.choices_snapshot)
                with ordinality as choice(value, ordinality)
            ),
            'selected_choice_id', a.selected_choice_id
          )
          order by q.position
        )
        from public.examination_questions as q
        left join public.examination_answers as a
          on a.session_id = q.session_id and a.position = q.position
        where q.session_id = v_session.id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.start_examination(p_examination_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam public.examinations%rowtype;
  v_registration_id uuid;
  v_session_id uuid;
  v_now timestamptz;
  v_duration interval;
  v_inserted_questions integer;
  v_competition_status text;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to start an examination.';
  end if;

  select exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot start or resume examinations.';
  end if;

  select e.* into v_exam
  from public.examinations as e
  where e.id = p_examination_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination was not found.';
  end if;

  select competition.status
  into v_competition_status
  from public.competitions as competition
  where competition.id = v_exam.competition_id;

  if not found or v_competition_status <> 'published' then
    raise exception using errcode = '55000', message = 'The competition is not published.';
  end if;

  select r.id into v_registration_id
  from public.competition_registrations as r
  where r.competition_id = v_exam.competition_id
    and r.user_id = v_user_id
    and r.status = 'eligible'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Only a student with an eligible competition registration may start this examination.';
  end if;

  select s.id into v_session_id
  from public.examination_sessions as s
  where s.examination_id = v_exam.id
    and s.registration_id = v_registration_id
    and s.user_id = v_user_id
  for update;

  if found then
    return public.get_examination_session(v_session_id);
  end if;

  v_now := pg_catalog.clock_timestamp();

  if v_exam.status not in ('scheduled', 'open') then
    raise exception using errcode = '55000', message = 'This examination is not scheduled or open.';
  end if;
  if v_now < v_exam.opens_at or v_now >= v_exam.closes_at then
    raise exception using errcode = '55000', message = 'The examination is outside its scheduled start window.';
  end if;

  v_duration := (
    v_exam.question_count::integer * v_exam.seconds_per_question::integer
  ) * interval '1 second';

  if v_now + v_duration > v_exam.closes_at then
    raise exception using errcode = '55000', message = 'There is not enough time remaining in the examination window to complete the configured question set.';
  end if;

  insert into public.examination_sessions (
    examination_id, registration_id, user_id, status, started_at, deadline_at, total_questions
  )
  values (
    v_exam.id, v_registration_id, v_user_id, 'in_progress', v_now,
    v_now + v_duration, v_exam.question_count
  )
  returning id into v_session_id;

  with picked as (
    select
      q.id,
      q.prompt,
      q.correct_choice_id,
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', choice.value ->> 'id',
            'text', choice.value ->> 'text'
          )
          order by choice.ordinality
        )
        from pg_catalog.jsonb_array_elements(q.choices)
          with ordinality as choice(value, ordinality)
      ) as choices_snapshot
    from public.question_bank as q
    where q.course_id = v_exam.course_id
      and q.active
      and pg_catalog.jsonb_typeof(q.choices) = 'array'
      and pg_catalog.jsonb_array_length(q.choices) = 4
      and (
        select count(*)
        from pg_catalog.jsonb_array_elements(q.choices) as choice(value)
        where pg_catalog.jsonb_typeof(choice.value) = 'object'
          and pg_catalog.jsonb_typeof(choice.value -> 'id') = 'string'
          and pg_catalog.jsonb_typeof(choice.value -> 'text') = 'string'
          and nullif(pg_catalog.btrim(choice.value ->> 'id'), '') is not null
      ) = 4
      and (
        select count(distinct choice.value ->> 'id')
        from pg_catalog.jsonb_array_elements(q.choices) as choice(value)
      ) = 4
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(q.choices) as choice(value)
        where choice.value ->> 'id' = q.correct_choice_id
      )
    order by pg_catalog.random()
    limit v_exam.question_count
  ),
  numbered as (
    select
      picked.*,
      pg_catalog.row_number() over (order by pg_catalog.random())::smallint as position
    from picked
  )
  insert into public.examination_questions (
    session_id, position, question_id, prompt_snapshot, choices_snapshot,
    correct_choice_id, question_starts_at, question_deadline_at
  )
  select
    v_session_id,
    numbered.position,
    numbered.id,
    numbered.prompt,
    numbered.choices_snapshot,
    numbered.correct_choice_id,
    v_now + ((numbered.position - 1)::integer * v_exam.seconds_per_question) * interval '1 second',
    v_now + (numbered.position::integer * v_exam.seconds_per_question) * interval '1 second'
  from numbered;

  get diagnostics v_inserted_questions = row_count;
  if v_inserted_questions <> v_exam.question_count then
    raise exception using
      errcode = 'P0001',
      message = pg_catalog.format(
        'Insufficient valid active questions for this course: requested %, found %.',
        v_exam.question_count, v_inserted_questions
      );
  end if;

  return public.get_examination_session(v_session_id);
end;
$$;

create or replace function public.submit_examination_answer(
  p_session_id uuid,
  p_position smallint,
  p_choice_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.examination_sessions%rowtype;
  v_registration_status text;
  v_examination_status text;
  v_competition_status text;
  v_choices jsonb;
  v_question_starts_at timestamptz;
  v_question_deadline_at timestamptz;
  v_now timestamptz;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to submit an examination answer.';
  end if;
  if p_position is null or p_position < 1 then
    raise exception using errcode = '22023', message = 'Question position must be a positive number.';
  end if;
  if p_choice_id is null or pg_catalog.btrim(p_choice_id) = '' then
    raise exception using errcode = '22023', message = 'A choice ID is required.';
  end if;

  select exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot submit examination answers.';
  end if;

  select s, r.status, e.status, co.status
  into v_session, v_registration_status, v_examination_status, v_competition_status
  from public.examination_sessions as s
  join public.competition_registrations as r
    on r.id = s.registration_id and r.user_id = s.user_id
  join public.examinations as e
    on e.id = s.examination_id
    and e.competition_id = r.competition_id
  join public.competitions as co on co.id = e.competition_id
  where s.id = p_session_id and s.user_id = v_user_id
  for update of s;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination session was not found for the authenticated user.';
  end if;
  if v_competition_status <> 'published' then
    raise exception using errcode = '55000', message = 'The competition is not published.';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception using errcode = '55000', message = 'Answers can only be saved to an examination in progress.';
  end if;
  if v_registration_status <> 'eligible' then
    raise exception using errcode = '42501', message = 'An eligible competition registration is required to answer examination questions.';
  end if;
  if v_examination_status not in ('scheduled', 'open') then
    raise exception using errcode = '55000', message = 'The examination is no longer accepting answers.';
  end if;

  select q.choices_snapshot, q.question_starts_at, q.question_deadline_at
  into v_choices, v_question_starts_at, v_question_deadline_at
  from public.examination_questions as q
  where q.session_id = v_session.id and q.position = p_position;

  if not found then
    raise exception using errcode = '22023', message = 'Question position does not belong to this examination session.';
  end if;
  if v_question_starts_at is null or v_question_deadline_at is null then
    raise exception using errcode = '55000', message = 'This question has no valid server-side answer window.';
  end if;
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_choices) as choice(value)
    where choice.value ->> 'id' = p_choice_id
  ) then
    raise exception using errcode = '22023', message = 'Choice ID is not one of this question''s available choices.';
  end if;

  v_now := pg_catalog.clock_timestamp();
  if v_now < v_question_starts_at then
    raise exception using errcode = '55000', message = 'This question''s answer window has not opened.';
  end if;
  if v_now >= v_question_deadline_at or v_now >= v_session.deadline_at then
    raise exception using errcode = '55000', message = 'The answer deadline for this question has passed.';
  end if;

  insert into public.examination_answers (session_id, position, selected_choice_id, answered_at)
  values (v_session.id, p_position, p_choice_id, v_now)
  on conflict (session_id, position) do update
  set selected_choice_id = excluded.selected_choice_id,
      answered_at = excluded.answered_at;
end;
$$;

create or replace function public.submit_examination(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.examination_sessions%rowtype;
  v_registration_status text;
  v_examination_status text;
  v_competition_status text;
  v_correct_count integer;
  v_now timestamptz;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to submit an examination.';
  end if;

  select exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot submit examinations.';
  end if;

  select s, r.status, e.status, co.status
  into v_session, v_registration_status, v_examination_status, v_competition_status
  from public.examination_sessions as s
  join public.competition_registrations as r
    on r.id = s.registration_id and r.user_id = s.user_id
  join public.examinations as e
    on e.id = s.examination_id
    and e.competition_id = r.competition_id
  join public.competitions as co on co.id = e.competition_id
  where s.id = p_session_id and s.user_id = v_user_id
  for update of s;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination session was not found for the authenticated user.';
  end if;
  if v_competition_status <> 'published' then
    raise exception using errcode = '55000', message = 'The competition is not published.';
  end if;
  if v_session.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'This examination session has been cancelled.';
  end if;

  v_now := pg_catalog.clock_timestamp();
  if v_session.status in ('submitted', 'expired') then
    return pg_catalog.jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'score', v_session.score,
      'correct_count', v_session.correct_count,
      'total_questions', v_session.total_questions,
      'submitted_at', v_session.submitted_at,
      'server_now', v_now
    );
  end if;

  if v_registration_status <> 'eligible' then
    raise exception using errcode = '42501', message = 'An eligible competition registration is required to submit this examination.';
  end if;
  if v_examination_status in ('draft', 'cancelled') then
    raise exception using errcode = '55000', message = 'This examination cannot be submitted in its current state.';
  end if;

  select count(*)::integer
  into v_correct_count
  from public.examination_answers as a
  join public.examination_questions as q
    on q.session_id = a.session_id and q.position = a.position
  where a.session_id = v_session.id
    and a.selected_choice_id = q.correct_choice_id;

  update public.examination_sessions as s
  set status = case when v_now >= v_session.deadline_at then 'expired' else 'submitted' end,
      submitted_at = v_now,
      correct_count = v_correct_count,
      score = pg_catalog.round(
        v_correct_count::numeric * 100 / v_session.total_questions,
        2
      )
  where s.id = v_session.id
  returning s.* into v_session;

  return pg_catalog.jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'score', v_session.score,
    'correct_count', v_session.correct_count,
    'total_questions', v_session.total_questions,
    'submitted_at', v_session.submitted_at,
    'server_now', v_now
  );
end;
$$;

create or replace function public.record_examination_signal(
  p_session_id uuid,
  p_signal text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.examination_sessions%rowtype;
  v_registration_status text;
  v_examination_status text;
  v_competition_status text;
  v_now timestamptz;
  v_account_suspended boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to record an examination signal.';
  end if;
  if p_signal is null or p_signal not in ('tab_hidden', 'window_blur', 'connection_lost') then
    raise exception using errcode = '22023', message = 'Unsupported examination signal.';
  end if;

  select exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.account_status = 'suspended'
  )
  into v_account_suspended;

  if v_account_suspended then
    raise exception using errcode = '42501', message = 'Suspended accounts cannot record examination signals.';
  end if;

  select s, r.status, e.status, co.status
  into v_session, v_registration_status, v_examination_status, v_competition_status
  from public.examination_sessions as s
  join public.competition_registrations as r
    on r.id = s.registration_id and r.user_id = s.user_id
  join public.examinations as e
    on e.id = s.examination_id
    and e.competition_id = r.competition_id
  join public.competitions as co on co.id = e.competition_id
  where s.id = p_session_id and s.user_id = v_user_id
  for update of s;

  if not found then
    raise exception using errcode = 'P0002', message = 'Examination session was not found for the authenticated user.';
  end if;
  if v_competition_status <> 'published' then
    raise exception using errcode = '55000', message = 'The competition is not published.';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception using errcode = '55000', message = 'Signals can only be recorded for an examination in progress.';
  end if;
  if v_registration_status <> 'eligible' then
    raise exception using errcode = '42501', message = 'An eligible competition registration is required for this examination.';
  end if;
  if v_examination_status not in ('scheduled', 'open') then
    raise exception using errcode = '55000', message = 'The examination is no longer active.';
  end if;

  v_now := pg_catalog.clock_timestamp();
  if v_now >= v_session.deadline_at then
    raise exception using errcode = '55000', message = 'The examination deadline has passed.';
  end if;

  if pg_catalog.array_position(v_session.risk_flags, p_signal) is null then
    update public.examination_sessions as s
    set risk_flags = pg_catalog.array_append(s.risk_flags, p_signal),
        interruption_count = s.interruption_count + 1
    where s.id = v_session.id;
  end if;
end;
$$;

revoke all on function public.get_student_exam_feed() from public, anon, authenticated;
revoke all on function public.start_examination(uuid) from public, anon, authenticated;
revoke all on function public.get_examination_session(uuid) from public, anon, authenticated;
revoke all on function public.submit_examination_answer(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.submit_examination(uuid) from public, anon, authenticated;
revoke all on function public.record_examination_signal(uuid, text) from public, anon, authenticated;

grant execute on function public.get_student_exam_feed() to authenticated;
grant execute on function public.start_examination(uuid) to authenticated;
grant execute on function public.get_examination_session(uuid) to authenticated;
grant execute on function public.submit_examination_answer(uuid, smallint, text) to authenticated;
grant execute on function public.submit_examination(uuid) to authenticated;
grant execute on function public.record_examination_signal(uuid, text) to authenticated;

commit;
