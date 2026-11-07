begin;

-- ============================================================
-- Fresh Phase 3–6 schema setup for the current legacy project
-- Safe for a clean start without the old bigint identity conflicts.
-- ============================================================

-- Drop the conflicting competition/payment tables so the new schema can be created cleanly.
drop table if exists public.financial_transactions cascade;
drop table if exists public.payment_receipts cascade;
drop table if exists public.refunds cascade;
drop table if exists public.payouts cascade;
drop table if exists public.payments cascade;
drop table if exists public.competition_registrations cascade;
drop table if exists public.competitions cascade;

-- ============================================================
-- 1) Competition lifecycle and registration tables
-- ============================================================
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  academic_level text not null default 'grade_12',
  stream text not null default 'natural_science',
  registration_deadline timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','registration_open','registration_closed','active','completed','cancelled','archived')),
  competition_type text not null default 'weekly_arena'
    check (competition_type in ('weekly_arena','grand_milestone')),
  entry_fee_etb numeric(12,2) not null default 10,
  participant_limit integer,
  minimum_participants integer not null default 1,
  reward_share_pct numeric(5,2) not null default 75,
  platform_share_pct numeric(5,2) not null default 25,
  winner_percent numeric(5,2) not null default 10,
  registration_opens_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competition_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','payment_pending','eligible','rejected','withdrawn','refund_pending','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index if not exists competition_registrations_comp_status_idx
  on public.competition_registrations (competition_id, status, created_at);

-- ============================================================
-- 2) Payment and refund tables
-- ============================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.competition_registrations(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  method text not null check (method in ('telebirr', 'cbe_birr')),
  amount_etb numeric(12,2) not null check (amount_etb > 0),
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 3 and 120),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'refund_pending', 'refunded')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_reference_ci_unique
  on public.payments (lower(trim(transaction_reference)));
create unique index if not exists payments_one_pending_per_registration
  on public.payments (registration_id) where status = 'pending';
create index if not exists payments_status_submitted_idx on public.payments (status, submitted_at desc);
create index if not exists payments_comp_status_idx on public.payments (competition_id, status);
create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_at timestamptz not null default now()
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  user_id uuid references auth.users(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  payout_id uuid,
  refund_id uuid,
  kind text not null check (kind in ('entry_revenue', 'payout', 'refund')),
  amount_etb numeric(12,2) not null check (amount_etb <> 0),
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 3 and 120),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint financial_transactions_one_source_check check (
    num_nonnulls(payment_id, payout_id, refund_id) = 1
  )
);

create unique index if not exists financial_transactions_reference_ci_unique
  on public.financial_transactions (lower(trim(transaction_reference)));
create unique index if not exists financial_transactions_payment_unique
  on public.financial_transactions (payment_id) where payment_id is not null;
create index if not exists financial_transactions_comp_date_idx
  on public.financial_transactions (competition_id, occurred_at desc);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_etb numeric(12,2) not null check (amount_etb > 0),
  status text not null default 'requested' check (status in ('requested', 'processing', 'refunded', 'failed')),
  external_reference text,
  note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refunds_status_created_idx on public.refunds (status, created_at desc);

-- ============================================================
-- 3) Academic content tables
-- ============================================================
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(trim(code)) between 2 and 24),
  title text not null check (char_length(trim(title)) between 2 and 120),
  academic_level text references public.academic_levels(id),
  stream text references public.streams(id),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 160),
  week_number smallint check (week_number is null or week_number between 1 and 16),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_topics_course_title_unique unique (course_id, title)
);
create index if not exists academic_topics_course_active_idx on public.academic_topics (course_id, active, week_number);

create table public.academic_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  size_bytes integer not null check (size_bytes between 1 and 52428800),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academic_materials_course_active_idx on public.academic_materials (course_id, active, created_at desc);

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  topic_id uuid references public.academic_topics(id) on delete restrict,
  prompt text not null check (char_length(trim(prompt)) between 5 and 3000),
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 4),
  correct_choice_id text not null check (char_length(correct_choice_id) between 1 and 24),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  difficulty text not null default 'standard' check (difficulty in ('introductory', 'standard', 'advanced')),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_bank_course_active_idx on public.question_bank (course_id, active, topic_id);

-- ============================================================
-- 4) Examination tables
-- ============================================================
create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  exam_type text not null check (exam_type in ('weekly_arena', 'grand_weekly', 'grand_final')),
  week_number smallint,
  title text not null check (char_length(trim(title)) between 3 and 140),
  question_count smallint not null default 10 check (question_count between 1 and 100),
  seconds_per_question smallint not null default 40 check (seconds_per_question between 30 and 45),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reconnect_grace_seconds smallint not null default 180 check (reconnect_grace_seconds between 0 and 900),
  allow_previous_navigation boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'open', 'closed', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint examinations_time_range_check check (closes_at > opens_at)
);
create unique index if not exists examinations_grand_week_unique
  on public.examinations (competition_id, exam_type, week_number) where exam_type = 'grand_weekly';
create unique index if not exists examinations_single_final_unique
  on public.examinations (competition_id, exam_type) where exam_type <> 'grand_weekly';
create index if not exists examinations_schedule_idx on public.examinations (status, opens_at, closes_at);

create table public.examination_sessions (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.examinations(id) on delete restrict,
  registration_id uuid not null references public.competition_registrations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  score numeric(5,2),
  correct_count smallint,
  total_questions smallint not null check (total_questions between 1 and 100),
  interruption_count integer not null default 0 check (interruption_count >= 0),
  risk_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (examination_id, registration_id),
  check (score is null or score between 0 and 100)
);
create index if not exists examination_sessions_exam_status_idx
  on public.examination_sessions (examination_id, status, started_at desc);
create index if not exists examination_sessions_user_idx
  on public.examination_sessions (user_id, started_at desc);

create table public.examination_questions (
  session_id uuid not null references public.examination_sessions(id) on delete restrict,
  position smallint not null check (position > 0),
  question_id uuid not null references public.question_bank(id) on delete restrict,
  prompt_snapshot text not null,
  choices_snapshot jsonb not null check (jsonb_typeof(choices_snapshot) = 'array' and jsonb_array_length(choices_snapshot) = 4),
  correct_choice_id text not null,
  question_starts_at timestamptz,
  question_deadline_at timestamptz,
  primary key (session_id, position),
  unique (session_id, question_id),
  check (question_deadline_at is null or question_starts_at is null or question_deadline_at >= question_starts_at)
);
create index if not exists examination_questions_question_idx on public.examination_questions (question_id);

create table public.examination_answers (
  session_id uuid not null,
  position smallint not null,
  selected_choice_id text not null,
  answered_at timestamptz not null default now(),
  primary key (session_id, position),
  foreign key (session_id, position) references public.examination_questions(session_id, position) on delete restrict
);

-- ============================================================
-- 5) Competition results and payouts
-- ============================================================
create table public.competition_result_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null unique references public.competitions(id) on delete restrict,
  finalized_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz not null default now(),
  eligible_count integer not null check (eligible_count > 0),
  gross_revenue_etb numeric(12,2) not null check (gross_revenue_etb >= 0),
  reward_pool_etb numeric(12,2) not null check (reward_pool_etb >= 0),
  platform_allocation_etb numeric(12,2) not null check (platform_allocation_etb >= 0),
  rules_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.competition_results (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.competition_result_snapshots(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  exam_score numeric(5,2) not null check (exam_score between 0 and 100),
  weekly_score numeric(5,2) not null check (weekly_score between 0 and 100),
  final_score numeric(5,2) not null check (final_score between 0 and 100),
  rank_number integer not null check (rank_number > 0),
  is_winner boolean not null default false,
  reward_amount_etb numeric(12,2) not null default 0 check (reward_amount_etb >= 0),
  finalized_at timestamptz not null default now(),
  unique (competition_id, user_id)
);
create index if not exists competition_results_rank_idx on public.competition_results (competition_id, rank_number, final_score desc);
create index if not exists competition_results_user_idx on public.competition_results (user_id, finalized_at desc);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references public.competition_results(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_etb numeric(12,2) not null check (amount_etb > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  transaction_reference text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  paid_at timestamptz
);
create index if not exists payouts_comp_status_idx on public.payouts (competition_id, status);
create index if not exists payouts_user_created_idx on public.payouts (user_id, created_at desc);

-- ============================================================
-- 6) Notification, audit, and system tables
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  category text not null check (category in ('payment', 'registration', 'examination', 'result', 'payout', 'competition', 'announcement', 'system')),
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 2 and 100),
  entity_type text not null check (char_length(trim(entity_type)) between 2 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create table public.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.weekly_operations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null unique references public.competitions(id) on delete restrict,
  week_start date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.weekly_operation_steps (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.weekly_operations(id) on delete restrict,
  step_key text not null check (step_key in ('settlement', 'payouts', 'archive', 'registration', 'bravo_cycle')),
  step_order smallint not null check (step_order between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'complete')),
  notes text,
  linked_competition_id uuid references public.competitions(id) on delete restrict,
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  unique (operation_id, step_key),
  unique (operation_id, step_order)
);

-- ============================================================
-- 7) Safety net: avoid empty schema issues
-- ============================================================
-- This is intentionally minimal and safe. It only creates a placeholder
-- competition if the table is empty, so the database is not left unusable.
insert into public.competitions (id, title, description, academic_level, stream, status, created_by, created_at)
select
  gen_random_uuid(),
  'Legacy Competition',
  'Imported from the legacy database',
  'grade_12',
  'natural_science',
  'draft',
  auth.uid(),
  now()
where not exists (select 1 from public.competitions)
limit 1;

-- ============================================================
-- 8) Security setup
-- ============================================================
alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.refunds enable row level security;
alter table public.courses enable row level security;
alter table public.academic_topics enable row level security;
alter table public.academic_materials enable row level security;
alter table public.question_bank enable row level security;
alter table public.examinations enable row level security;
alter table public.examination_sessions enable row level security;
alter table public.examination_questions enable row level security;
alter table public.examination_answers enable row level security;
alter table public.competition_result_snapshots enable row level security;
alter table public.competition_results enable row level security;
alter table public.payouts enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.weekly_operations enable row level security;
alter table public.weekly_operation_steps enable row level security;

commit;
