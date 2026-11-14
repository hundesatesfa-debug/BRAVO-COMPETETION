# BR@VO ARCHITECTURE ASSESSMENT
## Comprehensive Phase 1-3 Report

**Project:** BR@VO Academy Competition Platform  
**Database:** Supabase PostgreSQL (Project: fngwnmbpjxfjplqsddhr)  
**Assessment Date:** November 14, 2026  
**Assessment Type:** Read-only investigation with rebuild recommendation

---

## EXECUTIVE SUMMARY

### Critical Findings

1. **Schema Conflict**: The project has THREE conflicting schema definitions:
   - `SETUP.sql` (Phase 1-2: profiles, roles, competitions, study room)
   - `PHASES_3_6_SETUP.sql` (Phase 3-6: examinations, payments, complete system)
   - 11 migration files in `supabase/migrations/`

2. **Unclear Schema State**: Documentation states to run either SETUP.sql OR migrations, but:
   - No clear migration baseline exists
   - PHASES_3_6_SETUP.sql **drops and recreates** competition tables
   - Migration history is likely incomplete or inconsistent

3. **Major Architectural Gaps**: Current schema does NOT support confirmed requirements:
   - ❌ Academic quiz access/entitlement system (free + reward-based)
   - ❌ Competition rounds (one payment covers multiple rounds)
   - ❌ Automatic quiz unlocking after payment approval
   - ❌ Cumulative reward tracking across competitions
   - ❌ Quiz retake support (unlimited attempts on unlocked quizzes)
   - ❌ Idempotent payment approval with atomic reward grants
   - ❌ Secret competition access codes

4. **Payment-Reward Coupling Issue**: Current `admin_review_competition_payment` RPC likely does NOT:
   - Grant academic quiz rewards atomically
   - Prevent duplicate reward grants on repeated approval
   - Track reward ledger separately from competition eligibility

### Recommendation

**CONTROLLED REBUILD** is strongly recommended because:
- Fixing the current schema requires understanding which version is deployed
- The requirements demand fundamental structural changes
- A clean baseline eliminates migration conflicts
- Atomic operations for payment approval require careful transaction design

---

## PHASE 1: CURRENT SYSTEM ANALYSIS

### A. Database Schema Discovery

#### Existing Tables (from SETUP.sql + PHASES_3_6_SETUP.sql)

**Authentication & Profiles:**
```
public.app_role (enum)           - 'admin', 'student'
public.profiles                  - Student profiles with academic metadata
public.user_roles               - User role assignments
public.academic_levels          - Reference: grade_12, freshman
public.streams                  - Reference: natural_science, social_science
```

**Study Room (Phase 2):**
```
public.study_documents_metadata  - Local file metadata (not file contents)
public.study_sessions           - Study session tracking
public.weekly_bravo_balances    - Weekly Bravo point totals
public.daily_streak_registry    - Daily study consistency tracking
public.weekly_document_activity - Per-document weekly engagement
public.bravo_transactions       - Bravo award ledger
public.study_sync_logs          - Session validation diagnostics
```

**Competitions (PHASES_3_6_SETUP.sql):**
```
public.competitions             - Competition definitions
public.competition_registrations - Student registrations
public.payments                 - Payment submissions
public.payment_receipts         - Receipt file references
public.financial_transactions   - Financial ledger
public.refunds                  - Refund requests
```

**Academic Content (PHASES_3_6_SETUP.sql):**
```
public.courses                  - Academic courses
public.academic_topics          - Course topics/chapters
public.academic_materials       - PDF/PPT downloadable materials
public.question_bank            - Multiple-choice questions
```

**Examinations (PHASES_3_6_SETUP.sql):**
```
public.examinations             - Exam definitions (linked to competitions)
public.examination_sessions     - Student exam attempts
public.examination_questions    - Questions assigned to session (snapshot)
public.examination_answers      - Student answers
```

**Results & Payouts:**
```
public.competition_result_snapshots - Finalized competition results
public.competition_results          - Individual student rankings
public.payouts                      - Prize payment records
```

**System:**
```
public.notifications            - User notifications
public.audit_logs              - Admin action audit trail
public.system_settings         - Key-value configuration
public.weekly_operations       - Weekly competition workflow tracker
public.weekly_operation_steps  - Weekly workflow step tracker
```

#### Critical Database Functions

**Study Room:**
- `public.sync_study_sessions(jsonb)` - Validates and awards Bravos
- `public.get_bravo_wallet()` - Returns current week's Bravo balance

**Examinations:**
- `public.get_student_exam_feed()` - Student examination dashboard
- `public.start_examination(uuid)` - Creates examination session
- `public.submit_examination_answer(uuid, smallint, text)` - Saves answer
- `public.submit_examination(uuid)` - Finalizes exam and scores
- `public.record_examination_signal(uuid, text)` - Tracks interruptions

**Admin - Examinations:**
- `public.admin_save_examination(jsonb)` - Create/edit exam
- `public.admin_set_exam_status(uuid, text)` - Publish/schedule exam

**Admin - Competitions:**
- `public.admin_save_competition(jsonb)` - Create/edit competition
- `public.admin_set_competition_status(uuid, text)` - Open/close registration

**Admin - Payments:**
- `public.admin_review_competition_payment(uuid, text, text)` - Approve/reject
- `public.admin_update_refund(uuid, text, text, text)` - Process refund

**Student - Competitions:**
- `public.register_for_competition(uuid)` - Reserve registration slot
- `public.submit_competition_payment(uuid, text, numeric, text, text)` - Submit payment
- `public.withdraw_competition_registration(uuid)` - Cancel unpaid registration
- `public.request_competition_refund(uuid)` - Request refund

**Student - Results:**
- `public.get_competition_feed()` - List available competitions
- `public.get_competition_leaderboard(uuid)` - View competition rankings

**Admin - Weekly Operations:**
- `public.admin_open_weekly_operation(uuid)` - Start Sunday workflow
- `public.admin_complete_weekly_operation_step(uuid, text, jsonb)` - Mark step done

### B. Storage Buckets

**Known Buckets:**
1. `payment-receipts` - Payment proof images/PDFs (user uploads)
2. `academic-materials` - Official course materials (admin uploads, student downloads)

### C. Frontend Data Access Patterns

**Student Pages:**
- Dashboard: `profiles` (update name)
- Study Room: `academic_materials` (select), `storage.from('academic-materials').download()`
- Competitions: RPCs: `get_competition_feed`, `register_for_competition`, `submit_competition_payment`, etc.
- Exams: RPCs: `get_student_exam_feed`, `start_examination`, `submit_examination_answer`, `submit_examination`
- Results: `competition_results`, `payouts`, `get_competition_leaderboard`
- Notifications: `notifications` (select, update read_at)
- Bravos: RPC: `get_bravo_wallet`

**Admin Pages:**
- Students: `profiles`, `user_roles`, `academic_levels`, `streams` (select)
- Competitions: `competitions`, RPCs: `admin_save_competition`, `admin_set_competition_status`
- Examinations: `examinations`, `courses`, `question_bank`, RPCs: `admin_save_examination`, `admin_set_exam_status`
- Payments: `payments`, `payment_receipts`, `refunds`, RPCs: `admin_review_competition_payment`, `admin_update_refund`
- Weekly Operations: `competitions`, `weekly_operations`, `weekly_operation_steps`, RPCs

### D. Architecture Issues Identified

#### 1. Missing Academic Quiz Access System
**Current State:** No tables for quiz entitlements, unlocks, or access rules.

**Required (from specifications):**
- Free quiz configuration (admin decides which quizzes are free)
- Competition reward entitlements (payment approval grants X unlocks)
- Cumulative rewards across multiple competitions
- Quiz unlock ledger (which quizzes a student can access)
- Separate tracking of entitlements vs. individual attempts

**Current Examination System:** Only covers **competition exams**, not **academic quizzes**.

#### 2. No Competition Rounds Support
**Current State:** `examinations` table links to `competitions`, but:
- One payment = access to **one competition**
- No concept of multiple rounds per competition

**Required:**
- One payment covers **all rounds** within a competition
- Admin creates multiple rounds for a competition
- Separate round scheduling
- Weekly rounds for Grand Competition (95% final, 5% weekly average)

#### 3. Payment Approval Not Atomic with Rewards
**Current State:** `admin_review_competition_payment` RPC likely:
- Updates payment status
- Grants competition eligibility
- **May not** grant academic quiz rewards
- **May not** prevent duplicate reward grants

**Required:**
- Atomic transaction: payment approval + eligibility + quiz rewards
- Idempotent (safe to retry)
- Unique constraint prevents double-granting
- Audit log for reward allocation

#### 4. No Secret Access Codes
**Current State:** Competitions have no access code field.

**Required:**
- Secret access code per competition
- Code must never be exposed via public SELECT policies
- Code validation during registration (server-side only)

#### 5. Unclear Profile Registration Rules
**Current State:** `handle_new_user()` trigger enforces:
- Grade 12 students MUST provide `school_name`
- Freshmen CANNOT provide `school_name` (set to NULL)

**Required Behavior (from specifications):**
- Registration should be simple
- Academic level and stream are optional metadata
- School information should not be unnecessarily mandatory
- Students should NOT be forced to select Grade 12, Freshman, Natural Science, or Social Science

**Conflict:** Current trigger contradicts "simple registration" requirement.

#### 6. Weekly Operations Confusion
**Current State:** `weekly_operations` table exists with steps like:
- settlement, payouts, archive, registration, bravo_cycle

**Question:** Is this feature actually needed, or is it legacy from early design?
- Weekly competitions are managed through normal competition lifecycle
- Bravos cycle automatically by week in `sync_study_sessions`
- Purpose unclear; may be unnecessary complexity

### E. Migration File Analysis

**Migration Files (11 total):**
```
202611010001_foundation.sql
202611010002_registration_contact_details.sql
20261102172843_competition_workflows.sql
20261104164800_freshman_student_profiles.sql
20261106120000_grade_12_school_registration.sql
20261106130000_registration_cbe_account.sql
20261106192407_phase_2_student_study_wallet.sql
20261109120000_admin_dashboard_metrics_and_profile_phone.sql
20261110192412_examination_rpc_backend.sql
20261111182550_admin_examination_rpcs.sql
20261113153216_academic_materials_storage_bucket.sql
```

**Status:** Not inspected in detail during read-only phase.

**Concern:** 
- SETUP.sql does NOT populate migration history
- PHASES_3_6_SETUP.sql **drops tables** that migrations may create
- Running both would cause conflicts
- Unknown which schema version is deployed to live database

### F. Data Loss Risk Assessment

**CANNOT DETERMINE** without querying live database:
- Which tables contain production data
- Row counts for critical tables
- Whether users have active study sessions, payments, exam attempts
- Storage bucket object counts

**Assumption for planning:** Live database may contain:
- Real student profiles
- Active competition registrations
- Pending or verified payments
- Study session history and Bravo balances
- Uploaded payment receipts
- Academic materials in storage

**Preservation Strategy Required:** See Phase 3.

---

## PHASE 2: PROPOSED ARCHITECTURE

### A. Core Design Principles

1. **Feature-Oriented Schema**: Tables grouped by domain
2. **Clear Separation**: Academic quizzes ≠ competition exams
3. **Atomic Operations**: Payment approval + eligibility + rewards in ONE transaction
4. **Cumulative Rewards**: Rewards from different competitions accumulate
5. **Idempotency**: Safe to retry sensitive operations
6. **Audit Trail**: Every critical state change is logged
7. **Security**: RLS + server-side functions for sensitive data

### B. Proposed Table Structure

#### 1. Authentication & Profiles
**Keep with modifications:**

```sql
-- EXISTING (keep as-is)
public.app_role (enum)
public.profiles
public.user_roles
public.academic_levels (reference)
public.streams (reference)

-- MODIFY profiles trigger: make registration simpler
-- Remove mandatory school_name for Grade 12
-- Allow flexible academic_level and stream (optional metadata, not access control)
```

**Changes:**
- Remove strict validation in `handle_new_user()` that forces school name for Grade 12
- Make `academic_level` and `stream` truly optional
- Keep CBE account validation (required for payments)

#### 2. Study Room & Bravos
**Keep as-is (working well):**

```sql
public.study_documents_metadata
public.study_sessions
public.weekly_bravo_balances
public.daily_streak_registry
public.weekly_document_activity
public.bravo_transactions
public.study_sync_logs
-- Functions: sync_study_sessions, get_bravo_wallet
```

No changes needed. This system works correctly.

#### 3. Academic Content & Courses
**Keep with minor additions:**

```sql
-- EXISTING (keep)
public.courses
public.academic_topics
public.academic_materials

-- KEEP (question bank for academic quizzes)
public.question_bank
```

No structural changes needed.

#### 4. Academic Quizzes (NEW SYSTEM)

**Purpose:** Independent academic practice/assessment, separate from competitions.

```sql
-- Academic quiz definitions
CREATE TABLE public.academic_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  topic_id uuid REFERENCES public.academic_topics(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160),
  description text,
  question_count smallint NOT NULL DEFAULT 10 CHECK (question_count BETWEEN 1 AND 50),
  time_limit_minutes smallint CHECK (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 5 AND 120),
  difficulty text NOT NULL DEFAULT 'standard' CHECK (difficulty IN ('introductory', 'standard', 'advanced')),
  
  -- Access configuration
  access_type text NOT NULL DEFAULT 'free' CHECK (access_type IN ('free', 'reward_only', 'premium')),
  
  -- Status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Student quiz entitlements (reward balance)
CREATE TABLE public.quiz_entitlements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_unlocks integer NOT NULL DEFAULT 0 CHECK (available_unlocks >= 0),
  total_granted integer NOT NULL DEFAULT 0 CHECK (total_granted >= 0),
  total_consumed integer NOT NULL DEFAULT 0 CHECK (total_consumed >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id),
  CHECK (total_consumed <= total_granted)
);

-- Record of reward grants (audit + idempotency)
CREATE TABLE public.quiz_reward_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('competition_payment', 'admin_grant', 'promotion')),
  source_id uuid, -- competition_id or payment_id
  quantity smallint NOT NULL CHECK (quantity > 0),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  -- Prevent duplicate grants from same source
  UNIQUE (source_type, source_id)
);

-- Quizzes unlocked for a student
CREATE TABLE public.quiz_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.academic_quizzes(id) ON DELETE CASCADE,
  unlock_method text NOT NULL CHECK (unlock_method IN ('free_access', 'reward_unlock', 'admin_grant')),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  
  -- One unlock per quiz per student
  UNIQUE (user_id, quiz_id)
);

-- Quiz attempt sessions (separate from unlocks)
CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.academic_quizzes(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  score numeric(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  correct_count smallint,
  total_questions smallint NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'abandoned')),
  
  -- Foreign key to unlock (must have unlock to attempt)
  unlock_id uuid NOT NULL REFERENCES public.quiz_unlocks(id) ON DELETE RESTRICT
);

-- Quiz questions assigned to attempt (snapshot)
CREATE TABLE public.quiz_attempt_questions (
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position > 0),
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE RESTRICT,
  prompt_snapshot text NOT NULL,
  choices_snapshot jsonb NOT NULL,
  correct_choice_id text NOT NULL,
  PRIMARY KEY (attempt_id, position)
);

-- Student answers for quiz attempts
CREATE TABLE public.quiz_attempt_answers (
  attempt_id uuid NOT NULL,
  position smallint NOT NULL,
  selected_choice_id text NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, position),
  FOREIGN KEY (attempt_id, position) 
    REFERENCES public.quiz_attempt_questions(attempt_id, position) ON DELETE CASCADE
);
```

**Key Features:**
- Admin configures `access_type` per quiz (free vs. reward-only)
- `quiz_entitlements` tracks available unlock balance per student
- `quiz_reward_grants` prevents duplicate reward allocation
- `quiz_unlocks` records which quizzes student can access
- `quiz_attempts` allows unlimited retakes of unlocked quizzes
- Separate from competition examinations

#### 5. Competitions & Rounds (MODIFIED)

```sql
-- Competition definitions
CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 100),
  description text NOT NULL,
  
  -- Type determines rules
  competition_type text NOT NULL CHECK (competition_type IN ('weekly_arena', 'grand_milestone')),
  
  -- Entry requirements (academic level/stream are optional filters, NOT access control)
  academic_level text REFERENCES public.academic_levels(id),
  stream text REFERENCES public.streams(id),
  
  -- Financial rules (fixed by type)
  entry_fee_etb numeric(12,2) NOT NULL CHECK (entry_fee_etb > 0),
  reward_share_pct numeric(5,2) NOT NULL CHECK (reward_share_pct BETWEEN 0 AND 100),
  platform_share_pct numeric(5,2) NOT NULL CHECK (platform_share_pct BETWEEN 0 AND 100),
  participant_limit integer CHECK (participant_limit IS NULL OR participant_limit > 0),
  
  -- Academic quiz reward (granted immediately after payment approval)
  quiz_reward_quantity smallint NOT NULL DEFAULT 0 CHECK (quiz_reward_quantity >= 0),
  
  -- Secret access (never exposed via SELECT policies)
  access_code text CHECK (access_code IS NULL OR char_length(trim(access_code)) BETWEEN 4 AND 24),
  
  -- Schedule
  registration_opens_at timestamptz NOT NULL,
  registration_deadline timestamptz,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  
  -- Lifecycle
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'registration_open', 'registration_closed', 'active', 'completed', 'cancelled', 'archived'
  )),
  
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (registration_deadline <= starts_at),
  CHECK (ends_at > starts_at)
);

-- NEW: Competition rounds (one payment covers all rounds)
CREATE TABLE public.competition_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  round_number smallint NOT NULL CHECK (round_number > 0),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 100),
  round_type text NOT NULL CHECK (round_type IN ('weekly_round', 'final_round', 'practice_round')),
  
  -- Scheduling
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  
  -- Scoring weight (for Grand Competition: weekly = 5%, final = 95%)
  score_weight_pct numeric(5,2) NOT NULL DEFAULT 100 CHECK (score_weight_pct BETWEEN 0 AND 100),
  
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'closed', 'cancelled')),
  
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (competition_id, round_number),
  CHECK (closes_at > opens_at)
);

-- Student registrations (one per competition)
CREATE TABLE public.competition_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Status lifecycle
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'awaiting_payment', 'payment_pending', 'eligible', 'rejected', 'withdrawn', 'refund_requested', 'refunded'
  )),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (competition_id, user_id)
);
```

**Key Changes:**
- Added `quiz_reward_quantity` to competitions (grants academic quiz unlocks)
- Added `access_code` (never exposed to students via SELECT)
- **NEW:** `competition_rounds` table (one payment = all rounds access)
- Registration simpler: academic_level/stream are optional filters, not access gates

#### 6. Payments & Rewards (MODIFIED)

```sql
-- Payment submissions
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.competition_registrations(id) ON DELETE RESTRICT,
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  method text NOT NULL CHECK (method IN ('telebirr', 'cbe_birr')),
  amount_etb numeric(12,2) NOT NULL CHECK (amount_etb > 0),
  transaction_reference text NOT NULL CHECK (char_length(trim(transaction_reference)) BETWEEN 3 AND 120),
  
  -- Lifecycle
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'verified', 'rejected', 'refund_pending', 'refunded'
  )),
  
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text,
  
  -- Reward tracking (prevents duplicate grants)
  quiz_reward_granted boolean NOT NULL DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique transaction reference (case-insensitive)
  CONSTRAINT payments_reference_unique UNIQUE (lower(trim(transaction_reference))),
  
  -- Only one pending payment per registration
  CONSTRAINT payments_one_pending_per_reg 
    EXCLUDE USING btree (registration_id WITH =) WHERE (status = 'pending')
);

-- Payment receipts (image/PDF uploads)
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880), -- 5MB limit
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- Financial transactions ledger
CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  payout_id uuid,
  refund_id uuid,
  
  kind text NOT NULL CHECK (kind IN ('entry_revenue', 'payout', 'refund')),
  amount_etb numeric(12,2) NOT NULL CHECK (amount_etb <> 0),
  transaction_reference text NOT NULL CHECK (char_length(trim(transaction_reference)) BETWEEN 3 AND 120),
  
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Exactly one source
  CHECK (num_nonnulls(payment_id, payout_id, refund_id) = 1)
);

-- Refund requests
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  amount_etb numeric(12,2) NOT NULL CHECK (amount_etb > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'refunded', 'failed')),
  external_reference text,
  note text,
  
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Key Changes:**
- Added `quiz_reward_granted` flag to payments (idempotency check)
- Unique constraint on transaction reference (prevent duplicate submissions)
- Exclude constraint: only one pending payment per registration

#### 7. Competition Examinations (MODIFIED)

```sql
-- Examination definitions (linked to competition ROUNDS, not competitions)
CREATE TABLE public.examinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE RESTRICT,
  round_id uuid NOT NULL REFERENCES public.competition_rounds(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 140),
  question_count smallint NOT NULL DEFAULT 10 CHECK (question_count BETWEEN 1 AND 100),
  seconds_per_question smallint NOT NULL DEFAULT 40 CHECK (seconds_per_question BETWEEN 30 AND 45),
  
  -- Timing
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  reconnect_grace_seconds smallint NOT NULL DEFAULT 180 CHECK (reconnect_grace_seconds BETWEEN 0 AND 900),
  
  -- UI preferences
  allow_previous_navigation boolean NOT NULL DEFAULT true,
  
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'open', 'closed', 'cancelled')),
  
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (closes_at > opens_at)
);

-- Keep existing examination session tables (no changes needed)
CREATE TABLE public.examination_sessions (...); -- same as PHASES_3_6_SETUP.sql
CREATE TABLE public.examination_questions (...); -- same as PHASES_3_6_SETUP.sql
CREATE TABLE public.examination_answers (...); -- same as PHASES_3_6_SETUP.sql
```

**Key Changes:**
- Added `round_id` foreign key (examinations belong to rounds)
- Removed `exam_type` and `week_number` (replaced by round concept)

#### 8. Results & Payouts (KEEP AS-IS)

```sql
-- Same as PHASES_3_6_SETUP.sql
public.competition_result_snapshots
public.competition_results
public.payouts
```

No changes needed for now.

#### 9. Notifications & Audit (KEEP AS-IS)

```sql
-- Same as PHASES_3_6_SETUP.sql
public.notifications
public.audit_logs
public.system_settings
```

No changes needed.

#### 10. Weekly Operations (DECISION NEEDED)

**Question:** Is this feature necessary, or is it legacy complexity?

**Keep if:** Admin needs guided Sunday workflow for weekly competition settlement.  
**Remove if:** Normal competition lifecycle + admin tools are sufficient.

**Recommendation:** Mark as optional. Implement only if explicitly requested after core features are working.

### C. Critical Database Functions (NEW/MODIFIED)

#### 1. Payment Approval (ATOMIC)

```sql
CREATE FUNCTION public.admin_approve_competition_payment(
  p_payment_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_competition public.competitions%ROWTYPE;
  v_quiz_reward smallint;
  v_already_granted boolean;
BEGIN
  -- Verify admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  -- Lock payment row
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  
  -- Idempotency: if already verified, return success without changes
  IF v_payment.status = 'verified' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Payment was already verified',
      'quiz_reward_granted', v_payment.quiz_reward_granted
    );
  END IF;
  
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payments can be approved';
  END IF;
  
  -- Get competition
  SELECT * INTO v_competition
  FROM public.competitions
  WHERE id = v_payment.competition_id;
  
  -- ATOMIC TRANSACTION:
  -- 1. Update payment status
  UPDATE public.payments
  SET status = 'verified',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = p_note,
      updated_at = now()
  WHERE id = p_payment_id;
  
  -- 2. Grant competition eligibility
  UPDATE public.competition_registrations
  SET status = 'eligible',
      updated_at = now()
  WHERE id = v_payment.registration_id;
  
  -- 3. Record financial transaction
  INSERT INTO public.financial_transactions (
    competition_id, user_id, payment_id, kind, amount_etb, transaction_reference, created_by
  )
  VALUES (
    v_payment.competition_id,
    v_payment.user_id,
    v_payment.id,
    'entry_revenue',
    v_payment.amount_etb,
    v_payment.transaction_reference,
    auth.uid()
  );
  
  -- 4. Grant academic quiz rewards (if configured and not already granted)
  v_quiz_reward := v_competition.quiz_reward_quantity;
  v_already_granted := v_payment.quiz_reward_granted;
  
  IF v_quiz_reward > 0 AND NOT v_already_granted THEN
    -- Record reward grant (UNIQUE constraint prevents duplicates)
    INSERT INTO public.quiz_reward_grants (
      user_id, source_type, source_id, quantity, granted_by
    )
    VALUES (
      v_payment.user_id,
      'competition_payment',
      v_payment.competition_id,
      v_quiz_reward,
      auth.uid()
    )
    ON CONFLICT (source_type, source_id) DO NOTHING;
    
    -- Update or insert entitlement balance
    INSERT INTO public.quiz_entitlements (user_id, available_unlocks, total_granted)
    VALUES (v_payment.user_id, v_quiz_reward, v_quiz_reward)
    ON CONFLICT (user_id) DO UPDATE
    SET available_unlocks = quiz_entitlements.available_unlocks + v_quiz_reward,
        total_granted = quiz_entitlements.total_granted + v_quiz_reward,
        updated_at = now();
    
    -- Mark payment as rewarded
    UPDATE public.payments
    SET quiz_reward_granted = true
    WHERE id = p_payment_id;
    
    -- Trigger automatic quiz unlocking (separate function)
    PERFORM public.auto_unlock_quizzes(v_payment.user_id);
  END IF;
  
  -- 5. Audit log
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'payment_approved',
    'payment',
    p_payment_id,
    jsonb_build_object(
      'competition_id', v_payment.competition_id,
      'user_id', v_payment.user_id,
      'amount_etb', v_payment.amount_etb,
      'quiz_reward_granted', v_quiz_reward
    )
  );
  
  -- 6. Notify student
  INSERT INTO public.notifications (user_id, title, body, category, related_id)
  VALUES (
    v_payment.user_id,
    'Payment verified',
    format('Your payment for %s has been verified. You are now eligible to compete!', v_competition.title),
    'payment',
    p_payment_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payment approved and rewards granted',
    'quiz_reward_granted', v_quiz_reward
  );
END;
$$;
```

**Key Features:**
- **Atomic**: All operations in one transaction
- **Idempotent**: Safe to call multiple times (checks status, unique constraints)
- **Audit trail**: Logs every approval
- **Automatic rewards**: Grants quiz entitlements immediately
- **Notifications**: Student is informed

#### 2. Automatic Quiz Unlocking

```sql
CREATE FUNCTION public.auto_unlock_quizzes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_available_unlocks integer;
  v_quizzes_to_unlock uuid[];
  v_unlocked_count integer := 0;
BEGIN
  -- Get current entitlement balance
  SELECT available_unlocks INTO v_available_unlocks
  FROM public.quiz_entitlements
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF v_available_unlocks IS NULL OR v_available_unlocks <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Select eligible quizzes (reward_only, not already unlocked)
  SELECT array_agg(q.id)
  INTO v_quizzes_to_unlock
  FROM public.academic_quizzes q
  WHERE q.status = 'published'
    AND q.access_type = 'reward_only'
    AND NOT EXISTS (
      SELECT 1 FROM public.quiz_unlocks u
      WHERE u.user_id = p_user_id AND u.quiz_id = q.id
    )
  ORDER BY q.created_at ASC  -- Deterministic: oldest quizzes first
  LIMIT v_available_unlocks;
  
  IF v_quizzes_to_unlock IS NULL OR array_length(v_quizzes_to_unlock, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Unlock quizzes
  INSERT INTO public.quiz_unlocks (user_id, quiz_id, unlock_method)
  SELECT p_user_id, quiz_id, 'reward_unlock'
  FROM unnest(v_quizzes_to_unlock) AS quiz_id
  ON CONFLICT (user_id, quiz_id) DO NOTHING;
  
  GET DIAGNOSTICS v_unlocked_count = ROW_COUNT;
  
  -- Consume entitlements
  UPDATE public.quiz_entitlements
  SET available_unlocks = available_unlocks - v_unlocked_count,
      total_consumed = total_consumed + v_unlocked_count,
      updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN v_unlocked_count;
END;
$$;
```

**Key Features:**
- **Automatic**: Called after payment approval
- **Deterministic**: Always selects oldest eligible quizzes first
- **Safe**: Prevents double-unlocking with UNIQUE constraint
- **Trackable**: Updates entitlement balance

#### 3. Student Quiz Access Check

```sql
CREATE FUNCTION public.can_access_quiz(p_quiz_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_access_type text;
  v_has_unlock boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get quiz access type
  SELECT access_type INTO v_access_type
  FROM public.academic_quizzes
  WHERE id = p_quiz_id AND status = 'published';
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Free quizzes: always accessible
  IF v_access_type = 'free' THEN
    RETURN true;
  END IF;
  
  -- Reward-only quizzes: check unlock
  IF v_access_type = 'reward_only' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.quiz_unlocks
      WHERE user_id = v_user_id AND quiz_id = p_quiz_id
    ) INTO v_has_unlock;
    
    RETURN v_has_unlock;
  END IF;
  
  -- Premium: future implementation
  RETURN false;
END;
$$;
```

#### 4. Start Academic Quiz Attempt

```sql
CREATE FUNCTION public.start_quiz_attempt(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_quiz public.academic_quizzes%ROWTYPE;
  v_unlock_id uuid;
  v_attempt_id uuid;
  v_questions_inserted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Check access
  IF NOT public.can_access_quiz(p_quiz_id) THEN
    RAISE EXCEPTION 'You do not have access to this quiz';
  END IF;
  
  -- Get quiz
  SELECT * INTO v_quiz
  FROM public.academic_quizzes
  WHERE id = p_quiz_id AND status = 'published';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  
  -- Get unlock (even free quizzes create unlock record)
  SELECT id INTO v_unlock_id
  FROM public.quiz_unlocks
  WHERE user_id = v_user_id AND quiz_id = p_quiz_id;
  
  IF NOT FOUND THEN
    -- Auto-create unlock for free quizzes
    IF v_quiz.access_type = 'free' THEN
      INSERT INTO public.quiz_unlocks (user_id, quiz_id, unlock_method)
      VALUES (v_user_id, p_quiz_id, 'free_access')
      RETURNING id INTO v_unlock_id;
    ELSE
      RAISE EXCEPTION 'Quiz unlock not found';
    END IF;
  END IF;
  
  -- Create attempt
  INSERT INTO public.quiz_attempts (
    user_id, quiz_id, unlock_id, total_questions, status
  )
  VALUES (
    v_user_id, p_quiz_id, v_unlock_id, v_quiz.question_count, 'in_progress'
  )
  RETURNING id INTO v_attempt_id;
  
  -- Select and assign questions (same logic as examination questions)
  WITH picked AS (
    SELECT q.id, q.prompt, q.correct_choice_id, q.choices
    FROM public.question_bank q
    WHERE q.course_id = v_quiz.course_id
      AND q.active
      AND jsonb_array_length(q.choices) = 4
    ORDER BY random()
    LIMIT v_quiz.question_count
  ),
  numbered AS (
    SELECT *, row_number() OVER (ORDER BY random())::smallint AS position
    FROM picked
  )
  INSERT INTO public.quiz_attempt_questions (
    attempt_id, position, question_id, prompt_snapshot, choices_snapshot, correct_choice_id
  )
  SELECT
    v_attempt_id,
    position,
    id,
    prompt,
    choices,
    correct_choice_id
  FROM numbered;
  
  GET DIAGNOSTICS v_questions_inserted = ROW_COUNT;
  
  IF v_questions_inserted <> v_quiz.question_count THEN
    RAISE EXCEPTION 'Insufficient questions available for this quiz';
  END IF;
  
  -- Return attempt with questions
  RETURN public.get_quiz_attempt(v_attempt_id);
END;
$$;
```

**Key Features:**
- Checks `can_access_quiz()` before allowing attempt
- Auto-creates unlock for free quizzes
- Unlimited retakes (each call creates new attempt)
- Does NOT consume entitlement (only unlocking does)

### D. Security Model

#### RLS Policies

**Academic Quizzes:**
- SELECT: All authenticated users (but without answer keys)
- INSERT/UPDATE/DELETE: Admins only

**Quiz Entitlements:**
- SELECT: Own records only
- INSERT/UPDATE/DELETE: Server functions only

**Quiz Unlocks:**
- SELECT: Own records only
- INSERT/UPDATE/DELETE: Server functions only

**Quiz Attempts:**
- SELECT: Own attempts only
- INSERT/UPDATE/DELETE: Server functions only

**Payments:**
- SELECT: Own payments + admins see all
- INSERT: Students (via RPC)
- UPDATE/DELETE: Server functions only

**Competitions:**
- SELECT: Published competitions + admins see all (BUT access_code is never in SELECT)
- INSERT/UPDATE/DELETE: Admins only (via RPC)

**Competition Rounds:**
- SELECT: Related to accessible competitions
- INSERT/UPDATE/DELETE: Admins only (via RPC)

#### Function Security

**Admin functions:**
- `admin_approve_competition_payment()` - Check `has_role('admin')`
- `admin_reject_payment()` - Check `has_role('admin')`
- `admin_save_competition()` - Check `has_role('admin')`
- `admin_save_quiz()` - Check `has_role('admin')`

**Student functions:**
- `register_for_competition()` - Check auth + access code (if required)
- `submit_competition_payment()` - Check auth + valid registration
- `start_quiz_attempt()` - Check auth + quiz access
- `submit_quiz_answer()` - Check auth + active attempt
- `submit_quiz_attempt()` - Check auth + active attempt

**Helper functions:**
- `can_access_quiz()` - Used internally by RLS and attempt functions
- `auto_unlock_quizzes()` - Called by payment approval function

### E. Migration from Current Schema

**Strategy: CONTROLLED REBUILD with DATA PRESERVATION**

#### Step 1: Backup
```sql
-- Export critical tables to backup schema
CREATE SCHEMA IF NOT EXISTS backup_20261114;

-- Preserve authentication (managed by Supabase, cannot export auth.users)
CREATE TABLE backup_20261114.profiles AS SELECT * FROM public.profiles;
CREATE TABLE backup_20261114.user_roles AS SELECT * FROM public.user_roles;

-- Preserve study room data
CREATE TABLE backup_20261114.study_documents_metadata AS SELECT * FROM public.study_documents_metadata;
CREATE TABLE backup_20261114.study_sessions AS SELECT * FROM public.study_sessions;
CREATE TABLE backup_20261114.weekly_bravo_balances AS SELECT * FROM public.weekly_bravo_balances;
CREATE TABLE backup_20261114.daily_streak_registry AS SELECT * FROM public.daily_streak_registry;
CREATE TABLE backup_20261114.bravo_transactions AS SELECT * FROM public.bravo_transactions;

-- Preserve competition data (if any exists)
CREATE TABLE backup_20261114.competitions AS SELECT * FROM public.competitions;
CREATE TABLE backup_20261114.competition_registrations AS SELECT * FROM public.competition_registrations;
CREATE TABLE backup_20261114.payments AS SELECT * FROM public.payments;
CREATE TABLE backup_20261114.payment_receipts AS SELECT * FROM public.payment_receipts;

-- Preserve academic content (if any exists)
CREATE TABLE backup_20261114.courses AS SELECT * FROM public.courses;
CREATE TABLE backup_20261114.question_bank AS SELECT * FROM public.question_bank;
CREATE TABLE backup_20261114.academic_materials AS SELECT * FROM public.academic_materials;

-- Preserve examination data (if any exists)
CREATE TABLE backup_20261114.examinations AS SELECT * FROM public.examinations;
CREATE TABLE backup_20261114.examination_sessions AS SELECT * FROM public.examination_sessions;
```

#### Step 2: Drop Old Public Schema Objects
```sql
-- Drop tables in correct order (respect foreign keys)
DROP TABLE IF EXISTS public.examination_answers CASCADE;
DROP TABLE IF EXISTS public.examination_questions CASCADE;
DROP TABLE IF EXISTS public.examination_sessions CASCADE;
DROP TABLE IF EXISTS public.examinations CASCADE;

DROP TABLE IF EXISTS public.quiz_attempt_answers CASCADE;
DROP TABLE IF EXISTS public.quiz_attempt_questions CASCADE;
DROP TABLE IF EXISTS public.quiz_attempts CASCADE;

DROP TABLE IF EXISTS public.payouts CASCADE;
DROP TABLE IF EXISTS public.competition_results CASCADE;
DROP TABLE IF EXISTS public.competition_result_snapshots CASCADE;

DROP TABLE IF EXISTS public.refunds CASCADE;
DROP TABLE IF EXISTS public.financial_transactions CASCADE;
DROP TABLE IF EXISTS public.payment_receipts CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.competition_registrations CASCADE;
DROP TABLE IF EXISTS public.competition_rounds CASCADE;
DROP TABLE IF EXISTS public.competitions CASCADE;

DROP TABLE IF EXISTS public.weekly_operation_steps CASCADE;
DROP TABLE IF EXISTS public.weekly_operations CASCADE;

DROP TABLE IF EXISTS public.academic_materials CASCADE;
DROP TABLE IF EXISTS public.question_bank CASCADE;
DROP TABLE IF EXISTS public.academic_topics CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;

DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

-- Keep study room tables (they work correctly)
-- Keep profiles, user_roles (but modify trigger)

-- Drop old functions
DROP FUNCTION IF EXISTS public.admin_review_competition_payment CASCADE;
DROP FUNCTION IF EXISTS public.admin_save_competition CASCADE;
DROP FUNCTION IF EXISTS public.register_for_competition CASCADE;
-- ... (list all old RPCs)
```

#### Step 3: Create New Schema
```sql
-- Run new migration files in order:
-- 01_foundation.sql (academic_levels, streams, profiles, user_roles)
-- 02_study_room.sql (already exists, keep as-is)
-- 03_academic_content.sql (courses, topics, materials, question_bank)
-- 04_academic_quizzes.sql (NEW: quizzes, entitlements, unlocks, attempts)
-- 05_competitions.sql (competitions, rounds, registrations)
-- 06_payments.sql (payments, receipts, financial_transactions, refunds)
-- 07_examinations.sql (examinations, sessions, questions, answers)
-- 08_results.sql (snapshots, results, payouts)
-- 09_notifications.sql (notifications, audit_logs, system_settings)
-- 10_functions_student.sql (student-facing RPCs)
-- 11_functions_admin.sql (admin-facing RPCs)
-- 12_rls_policies.sql (Row Level Security)
-- 13_grants.sql (Table grants)
```

#### Step 4: Restore Data
```sql
-- Profiles and roles (already preserved by keeping tables)
-- Study room data (already preserved by keeping tables)

-- Competitions (if any exist)
INSERT INTO public.competitions (...)
SELECT ... FROM backup_20261114.competitions;

-- Registrations (update status if needed)
INSERT INTO public.competition_registrations (...)
SELECT ... FROM backup_20261114.competition_registrations;

-- Payments (add default values for new columns)
INSERT INTO public.payments (...)
SELECT ..., false AS quiz_reward_granted
FROM backup_20261114.payments;

-- Academic content (if any exists)
INSERT INTO public.courses (...) SELECT ... FROM backup_20261114.courses;
INSERT INTO public.question_bank (...) SELECT ... FROM backup_20261114.question_bank;
```

#### Step 5: Verification
```sql
-- Verify row counts
SELECT 'profiles', count(*) FROM public.profiles
UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles
UNION ALL SELECT 'study_sessions', count(*) FROM public.study_sessions
UNION ALL SELECT 'competitions', count(*) FROM public.competitions
UNION ALL SELECT 'payments', count(*) FROM public.payments;

-- Verify critical functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Test authentication
SELECT public.has_role(auth.uid(), 'student');

-- Test quiz access (should fail gracefully if no quizzes)
SELECT public.can_access_quiz('00000000-0000-0000-0000-000000000000');
```

#### Step 6: Frontend Updates

**New/Modified RPCs to call:**
- `public.get_student_quiz_feed()` - List available academic quizzes
- `public.start_quiz_attempt(uuid)` - Start quiz attempt
- `public.submit_quiz_answer(uuid, smallint, text)` - Save quiz answer
- `public.submit_quiz_attempt(uuid)` - Finalize quiz
- `public.get_quiz_entitlements()` - Check unlock balance
- `public.admin_approve_competition_payment(uuid, text)` - New approval function

**Modified Queries:**
- Competitions: No change (SELECT still works)
- Examinations: Add round selection logic
- Payments: Display quiz reward status

---

## PHASE 3: REBUILD PLAN

### A. Pre-Rebuild Checklist

**MUST COMPLETE before any destructive operations:**

1. ✅ **Live Database Inspection** (NOT YET DONE)
   ```sql
   -- Run these queries against live database:
   SELECT schemaname, tablename, 
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables 
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
   
   -- Row counts for critical tables
   SELECT 'profiles' AS table_name, count(*) AS rows FROM public.profiles
   UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles
   UNION ALL SELECT 'competitions', count(*) FROM public.competitions
   UNION ALL SELECT 'payments', count(*) FROM public.payments
   UNION ALL SELECT 'study_sessions', count(*) FROM public.study_sessions
   UNION ALL SELECT 'bravo_transactions', count(*) FROM public.bravo_transactions;
   
   -- Storage buckets
   SELECT * FROM storage.buckets;
   SELECT bucket_id, count(*) AS object_count
   FROM storage.objects
   GROUP BY bucket_id;
   ```

2. ✅ **Full Database Export**
   ```bash
   # Using Supabase CLI
   npx supabase db dump --remote > backup_before_rebuild_20261114.sql
   
   # Or using pg_dump (requires connection string)
   pg_dump "postgresql://postgres:[PASSWORD]@db.fngwnmbpjxfjplqsddhr.supabase.co:5432/postgres" \
     --schema=public --no-owner > backup_before_rebuild_20261114.sql
   ```

3. ✅ **Storage Bucket Inventory**
   - Document all objects in `payment-receipts` bucket
   - Document all objects in `academic-materials` bucket
   - Verify bucket policies are documented

4. ✅ **Frontend Compatibility Review**
   - List all `.from()` and `.rpc()` calls in codebase
   - Map to new schema/functions
   - Identify breaking changes

5. ✅ **Stakeholder Approval**
   - Present this document to project owner
   - Confirm requirements are accurately captured
   - Get explicit approval for:
     - Dropping/recreating tables
     - Modifying registration flow
     - New academic quiz system
     - Payment approval changes

### B. Migration File Structure

**Proposed Migration Files:**

```
supabase/migrations/
├── 20261115000001_rebuild_baseline.sql       -- Drop old, create new foundation
├── 20261115000002_academic_quizzes.sql       -- NEW: Quiz system
├── 20261115000003_competition_rounds.sql     -- NEW: Rounds system
├── 20261115000004_payment_rewards.sql        -- Modified: Atomic approval
├── 20261115000005_examination_rounds.sql     -- Modified: Link to rounds
├── 20261115000006_student_functions.sql      -- Student RPCs
├── 20261115000007_admin_functions.sql        -- Admin RPCs
├── 20261115000008_rls_policies.sql           -- Security policies
├── 20261115000009_data_restoration.sql       -- Restore from backup schema
└── 20261115000010_verification.sql           -- Smoke tests
```

### C. Rollback Strategy

**If rebuild fails:**

1. **Restore from pg_dump backup:**
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.fngwnmbpjxfjplqsddhr.supabase.co:5432/postgres" \
     < backup_before_rebuild_20261114.sql
   ```

2. **Restore from backup schema:**
   ```sql
   -- If backup schema still exists
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   -- Restore tables from backup_20261114.*
   CREATE TABLE public.profiles AS SELECT * FROM backup_20261114.profiles;
   -- ... (restore all tables)
   ```

3. **Revert frontend code:**
   ```bash
   git revert [commit-hash-of-frontend-changes]
   ```

### D. Testing Plan

**After rebuild, test in order:**

1. **Authentication & Profiles**
   - ✅ New user registration (simple flow)
   - ✅ Profile display
   - ✅ Role assignment (student/admin)

2. **Study Room**
   - ✅ Add local document
   - ✅ Start study session
   - ✅ Sync session to server
   - ✅ Verify Bravo award

3. **Academic Content**
   - ✅ Admin creates course
   - ✅ Admin creates quiz (free access)
   - ✅ Admin adds questions
   - ✅ Student views available quizzes
   - ✅ Student takes free quiz
   - ✅ Student retakes same quiz

4. **Competitions & Payments**
   - ✅ Admin creates competition with quiz reward
   - ✅ Student registers for competition
   - ✅ Student submits payment
   - ✅ Admin approves payment
   - ✅ Verify student has competition eligibility
   - ✅ Verify student received quiz reward
   - ✅ Verify quiz auto-unlocked

5. **Competition Rounds**
   - ✅ Admin creates multiple rounds
   - ✅ Verify student can access all rounds with one payment

6. **Academic Quiz Rewards**
   - ✅ Student takes reward-unlocked quiz
   - ✅ Verify entitlement balance decreased
   - ✅ Student joins second competition
   - ✅ Verify rewards accumulate (not overwritten)

7. **Competition Examinations**
   - ✅ Admin creates exam for round
   - ✅ Student starts exam
   - ✅ Student submits answers
   - ✅ Verify score

8. **Idempotency & Edge Cases**
   - ✅ Approve same payment twice (should succeed, no duplicate rewards)
   - ✅ Submit duplicate transaction reference (should fail)
   - ✅ Register for same competition twice (should fail)
   - ✅ Unlock same quiz twice (should succeed, no duplicate unlock)

9. **Security**
   - ✅ Student cannot SELECT competition.access_code
   - ✅ Student cannot UPDATE own role
   - ✅ Student cannot approve payments
   - ✅ Student cannot access other student's data

### E. Timeline Estimate

**Assuming approval and no production data complications:**

- **Phase 3a: Final Planning** - 2 hours
  - Live database inspection
  - Row count verification
  - Final requirements review

- **Phase 3b: Migration File Creation** - 6 hours
  - Write 10 migration SQL files
  - Write data restoration scripts
  - Write verification tests

- **Phase 3c: Local Testing** - 4 hours
  - Test migrations on local Supabase
  - Verify all functions work
  - Test frontend integration

- **Phase 3d: Production Backup** - 30 minutes
  - Full pg_dump
  - Storage bucket inventory
  - Verify backup integrity

- **Phase 3e: Production Rebuild** - 2 hours
  - Run migrations
  - Restore data
  - Verify functions
  - Smoke test critical paths

- **Phase 3f: Frontend Updates** - 8 hours
  - Update RPC calls
  - Add quiz pages
  - Update competition pages
  - Test end-to-end

- **Phase 3g: Testing & Fixes** - 6 hours
  - Full test suite
  - Bug fixes
  - Security verification

**Total: ~28 hours (3-4 working days)**

---

## PHASE 4: RISKS & DECISIONS NEEDED

### A. High-Risk Items

1. **Unknown Live Database State**
   - Risk: Current schema may differ from SETUP.sql/PHASES_3_6_SETUP.sql
   - Mitigation: Must inspect live database before proceeding
   - Decision: CANNOT proceed without live database inspection

2. **Production Data Loss**
   - Risk: Student profiles, payment records, study history could be lost
   - Mitigation: Full backup + backup schema + restore scripts
   - Decision: Test restore procedure before production rebuild

3. **Payment Approval Function Changes**
   - Risk: Current `admin_review_competition_payment` may have undocumented logic
   - Mitigation: Read existing function code, preserve all behaviors
   - Decision: Verify with project owner that new function captures all requirements

4. **Frontend Breaking Changes**
   - Risk: Many RPC calls will change signatures
   - Mitigation: Map all current calls to new functions, test in staging
   - Decision: Coordinate frontend updates with database deployment

### B. Unclear Requirements

1. **Weekly Operations Feature**
   - Question: Is `weekly_operations` table still needed?
   - Current assessment: May be unnecessary complexity
   - Decision needed: Keep or remove?

2. **Profile Registration Strictness**
   - Question: Should Grade 12 students MUST provide school name?
   - Current trigger: Enforces school_name for Grade 12
   - Specifications say: "Keep registration simple," "school info not mandatory"
   - Decision needed: Relax trigger or keep validation?

3. **Academic Materials vs. Study Documents**
   - Question: Should academic_materials be downloadable for offline use?
   - Current: Students can download from `academic-materials` bucket
   - Study documents: Private, local-only
   - Decision needed: Keep separate systems or unify?

4. **Premium Quiz Access**
   - Question: What is "premium" access type?
   - Current plan: Placeholder for future paid quizzes
   - Decision needed: Implement now or leave for Phase 7+?

### C. Technical Debt

1. **Migration History Confusion**
   - Current: SETUP.sql vs. migrations vs. PHASES_3_6_SETUP.sql
   - Solution: Clean baseline with new migrations
   - Impact: Old migration history will be abandoned

2. **Function Naming Convention**
   - Current: Mix of `admin_*`, `public.*`, `get_*`
   - Recommendation: Standardize on `admin_*`, `student_*`, `get_*`, `set_*`
   - Decision needed: Rename functions or keep current names?

3. **JSONB Response Formats**
   - Current: Functions return jsonb with varying structures
   - Recommendation: Standardize response format:
     ```json
     {
       "success": true,
       "data": {...},
       "message": "...",
       "errors": []
     }
     ```
   - Decision needed: Standardize now or accept inconsistency?

---

## APPROVAL CHECKLIST

Before proceeding to Phase 5 (implementation), I need your explicit approval for:

### Schema Changes
- [ ] **Drop and recreate** competition, payment, examination, and academic quiz tables
- [ ] **Preserve** study room tables (no changes)
- [ ] **Preserve** profiles and user_roles tables (modify trigger only)
- [ ] **Add** academic quiz system (10 new tables)
- [ ] **Add** competition rounds system (1 new table)
- [ ] **Modify** payment approval to grant quiz rewards atomically

### Feature Changes
- [ ] **Simplify** student registration (relax academic level/stream/school validation)
- [ ] **Add** academic quiz access control (free vs. reward-unlocked)
- [ ] **Add** quiz entitlement system (cumulative rewards)
- [ ] **Add** automatic quiz unlocking after payment approval
- [ ] **Add** competition rounds (one payment = all rounds access)
- [ ] **Add** secret competition access codes
- [ ] **Remove** or **Keep** weekly operations feature (YOUR DECISION)

### Data Operations
- [ ] **Backup** full database before rebuild
- [ ] **Drop** public schema tables (except study room, profiles, user_roles)
- [ ] **Restore** data from backup after rebuild
- [ ] **Verify** no data loss for: profiles, study sessions, Bravo balances

### Timeline & Risk
- [ ] Accept ~28 hour implementation timeline (3-4 days)
- [ ] Accept risk of temporary service disruption during rebuild
- [ ] Accept that frontend will need updates to work with new schema

---

## NEXT STEPS

Once you approve:

1. **Phase 5:** Write migration SQL files
2. **Phase 6:** Update frontend code
3. **Phase 7:** Test on local Supabase instance
4. **Phase 8:** Backup production database
5. **Phase 9:** Deploy to production
6. **Phase 10:** Verify and test

**DO NOT PROCEED without your explicit approval.**

---

## QUESTIONS FOR YOU

1. Should I inspect the live database now, or wait for your approval?
2. Which unclear requirements do you want to clarify first?
3. Should I remove the `weekly_operations` feature or keep it?
4. Should I relax the Grade 12 school name validation?
5. Any other concerns or requirements I missed?

**Your feedback will determine the final architecture.**
