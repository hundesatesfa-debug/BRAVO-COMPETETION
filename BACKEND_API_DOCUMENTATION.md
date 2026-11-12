# BR@VO Backend API Documentation

This report documents the checked-in React/Vite frontend and Supabase SQL as inspected on 2026-11-10. It is an implementation inventory, not a live-project introspection: no Supabase dashboard or database query was used.

## Evidence labels

- **Verified in frontend** — a concrete Supabase SDK call or storage operation exists in an active screen.
- **Verified in checked-in SQL** — a table, function, grant, or RLS policy is present in a repository SQL file.
- **Inferred** — a standard Supabase HTTP route, a response shape the UI expects, or an SQL type inferred from the JavaScript value; the contract was not found in checked-in SQL.
- **Not verified** — depends on live Supabase settings or SQL that is not present in the repository.

Do not treat an inferred or unverified item as a guaranteed deployed API contract. In particular, use the deployed project's SQL/API schema as the source of truth before implementing production mobile calls.

## 1. Supabase configuration

| Item | Finding |
|---|---|
| Project URL | `https://fngwnmbpjxfjplqsddhr.supabase.co` (**verified** from local `.env.local` value of `VITE_SUPABASE_URL`; URL is not a key). |
| Browser client key variable | `VITE_SUPABASE_PUBLISHABLE_KEY` is checked first. `src/lib/supabase.js` falls back to `VITE_SUPABASE_ANON_KEY`. The local environment has the publishable variable configured. **Key values are intentionally not included here.** |
| Client | `@supabase/supabase-js` `createClient(url, key, options)`; the client is `null` when configuration is absent or a template placeholder. |
| Auth client options | `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: true`. Browser persistence is the SDK's browser storage behavior; Android should use native secure session storage instead. |
| Auth providers | **Code supports** email/password and phone/password, SMS OTP verification, and email/phone password recovery. **Live provider enablement is not verifiable from repository files.** `supabase/README.md` says phone login/recovery requires the Phone provider and an SMS provider, and recommends email confirmation for production. |
| Redirects in code | Signup email redirect: current origin + `/welcome`. Email recovery redirect: current origin + `/reset-password`. These routes must be allowed in the deployed Auth URL configuration. |
| Storage buckets used by frontend | `academic-materials` and `payment-receipts` (**verified in SDK calls**). Bucket existence, public/private mode, size limits, MIME restrictions, and Storage RLS policies are **not verified**; no bucket provisioning/policy definition was found in the checked-in SQL/config. |
| Local Supabase config | `supabase/config.toml` only sets `project_id = "bravo-academy"`; it does not define project URL, Auth provider configuration, buckets, or Edge Functions. |

No secret or service-role key is documented. Never put a Supabase secret/service-role key, database password, or provider private key in Android resources, source, build config, or a `VITE_` variable.

## 2. Authentication endpoints

The frontend calls Supabase Auth SDK methods, not hand-written HTTP URLs. The SDK-to-HTTP route mapping below is **inferred from standard Supabase Auth API conventions**; the SDK calls and argument payloads are **verified in frontend**.

| Feature | Frontend call and payload | Expected behavior / HTTP route |
|---|---|---|
| Registration | `supabase.auth.signUp({ email, password, options: { data, emailRedirectTo } })`, or `{ phone, password, options: { data } }`. Metadata includes `full_name`, `phone`, `academic_level`, `stream`, `school_name` (Grade 12 only), `cbe_account_number`, `academic_level_id`, and `stream_id`. | **Inferred:** `POST /auth/v1/signup`. Email confirmation may leave `data.session` null until the confirmation link is followed; phone registration prompts for an SMS code. The Auth database trigger is expected to create `profiles` and a student `user_roles` row (**verified in SQL**). |
| Login | `signInWithPassword({ email, password })` or `{ phone, password }`. | **Inferred:** `POST /auth/v1/token?grant_type=password`. On success, the app loads the account profile and routes to `/dashboard`. |
| Phone signup verification | `verifyOtp({ phone, token, type: 'sms' })`; token is a 6-digit code in the UI. | **Inferred:** `POST /auth/v1/verify`. On success the app refreshes the profile. |
| Logout | `supabase.auth.signOut()`; errors are surfaced. | **Inferred:** `POST /auth/v1/logout`; SDK removes its persisted session. |
| Session restoration | `supabase.auth.getSession()` on initialization, plus `onAuthStateChange(...)` listener. | `getSession` primarily restores the SDK-persisted session; refresh/network traffic if needed is handled by the SDK. No custom refresh-token endpoint is called directly. |
| Email password recovery | `resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`. | **Inferred:** `POST /auth/v1/recover`; email delivery depends on live Auth/email configuration. |
| Phone password recovery | `signInWithOtp({ phone, options: { shouldCreateUser: false } })`, then `verifyOtp({ phone, token, type: 'sms' })`. Resend repeats `signInWithOtp`. | **Inferred:** OTP and verification routes under `/auth/v1`; exact provider/template behavior is live configuration. |
| Password reset | `updateUser({ password })` after recovery state/session is detected. Frontend requires at least 8 characters and matching confirmation. | **Inferred:** authenticated `PUT /auth/v1/user`. The recovery session is required; the SDK handles its access token. |
| Profile/account loading | `profiles.select('*').eq('id', user.id).single()`; `user_roles.select('role').eq('user_id', user.id)`; `payments.select('status').eq('user_id', user.id).eq('status','verified').limit(1)`. It optionally looks up `academic_levels.name` and `streams.name` by profile ID values. | **Inferred:** authenticated PostgREST `/rest/v1/...` requests. The app chooses admin if any role row is `admin`, otherwise the first role or `student`. Student verified-payment state is derived from the payment query; admins are treated as verified. |

Profile loading also stores a limited profile/role snapshot in browser `localStorage` for offline UI use. This is not a backend endpoint or authorization proof. Native clients must not trust locally cached role/account status for server access decisions.

## 3. Database operations

The tables below are direct table references from active frontend code unless marked otherwise. `select('*')` means the frontend requests every column in the deployed table; where a query selects named columns, the exact projection is shown. Schema columns are taken from the checked-in bootstrap/migration SQL and may differ from the live database.

### Directly referenced tables

| Table | Columns requested, written, or consumed | Frontend operations and filters | RLS / relationships discoverable in repository |
|---|---|---|---|
| `academic_levels` | `id`, `name` | Admin student listing: SELECT. Profile fallback lookup: `name` by `id`. | RLS enabled; public `anon`/`authenticated` SELECT policy `true` in `SETUP.sql`. |
| `streams` | `id`, `name` | Admin student listing: SELECT. Profile fallback lookup: `name` by `id`. | RLS enabled; public `anon`/`authenticated` SELECT policy `true` in `SETUP.sql`. |
| `profiles` | Self-load requests `*`. Admin projections request `id`, `full_name`, `phone`, `academic_level`, `stream`, `academic_level_id`, `stream_id`, `university`, `department`, `created_at`, `school_name`, and `account_status`; the suspended-account UI also reads `account_status_note`. `has_verified_payment` is **computed** from `payments`, not selected as a profile column. | SELECT self by `id`; admin screens SELECT filtered rows or IDs (`account_status='active'`, `id IN (...)`) and order/limit. No direct profile INSERT/UPDATE/DELETE from active frontend; registration metadata is written by the Auth trigger. | FK `profiles.id -> auth.users.id`; academic-level/stream references in bootstrap SQL. RLS policy reads self or admin. Bootstrap permits self UPDATE by row policy but grants only `full_name, avatar_url`. New-user trigger inserts profiles. The bootstrap defines textual `academic_level`/`stream` and does **not** define `academic_level_id`, `stream_id`, `account_status`, or `account_status_note`, although frontend admin screens request some of them. Actual deployed schema is **not verified**. |
| `user_roles` | `user_id`, `role` | SELECT role(s) for current user; admin screens SELECT student IDs by `role='student'`. No client writes. | FK to `auth.users`; RLS allows self or admin SELECT. Role creation is by Auth trigger; admin promotion is a trusted-owner SQL operation, not a client feature. |
| `payments` | Student account load: `status`; competition UI: `id, registration_id, method, amount_etb, transaction_reference, status, review_note, submitted_at`; admin requests `*`. | SELECT current user's rows by `user_id`, ordered by `submitted_at`; `status='verified'` limited to one. Admin SELECT all ordered/limited. Payment submission/review is through RPC, not direct table INSERT/UPDATE. | Phase 3–6 schema links to registrations, competitions, and auth users. RLS enabled in `PHASES_3_6_SETUP.sql`; no policy is defined there. `20261109120000...sql` adds admin-only SELECT policy. Student read policy and deployed state are **not verified**. |
| `competitions` | Admin screens request `*`; other admin projections use `id,title,competition_type,status,entry_fee_etb,starts_at,ends_at`. Feed RPC supplies competition rows to student screens. | Admin SELECT ordered by `starts_at` (or `ends_at` for weekly ops). Student competition/results screens use `get_competition_feed`, not direct table query. | FK `created_by -> auth.users`. Older competition migration/bootstrap defines authenticated read of published/closed plus admin read and admin-only DML; the later Phase 3–6 schema has additional fields/statuses and no policies in its script. Active DB schema/policies are **not verified**. |
| `competition_registrations` | Only an unreferenced legacy component requests `competition_id, student_id, registered_at`; active screens use RPCs. Phase 3–6 schema uses `competition_id,user_id,status,created_at,updated_at`. | Legacy component SELECT all registrations for admin, or `competition_id` filtered by `student_id` for a student. Active registration/withdraw/refund operations are RPC calls. No active direct writes. | FKs to `competitions` and `auth.users`; unique `(competition_id,user_id)` in Phase 3–6. Legacy component column names conflict with the Phase 3–6 schema. The component is not imported by the active dashboard. Bootstrap policy allows own/admin SELECT and drops the old direct registration INSERT/DELETE policies. |
| `system_settings` | `key`, `value` | Student competition screen SELECTs only `telebirr_instructions`, `cbe_birr_instructions`; admin settings SELECTs configured key set. Admin writes use `admin_update_system_settings`. | RLS enabled in Phase 3–6 setup, but no table policies are defined in that script. RPC authorization cannot be checked from checked-in definitions. |
| `academic_materials` | Student view: `id,title,description,object_path,mime_type,size_bytes,courses(code,title)`; admin requests `*`. Writes use `course_id,title,description,object_path,mime_type,size_bytes,created_by`; update `active`; delete by `id`. | Student SELECT of active learning materials (query also filters/joins by course in the page). Admin SELECT ordered/limited; INSERT, UPDATE `active` by `id`, DELETE by `id`. | FK `course_id -> courses`; `object_path` points into `academic-materials` Storage bucket. RLS enabled in Phase 3–6 script, but no policies are defined there. |
| `courses` | Admin `*`; exam picker `id,code,title` where `active=true`; nested `courses(code,title)` for materials. | SELECT ordered by title; admin INSERT of `code,title,academic_level,stream,created_by`. | Academic level/stream references; RLS enabled with no policy in Phase 3–6 script. |
| `academic_topics` | Admin `*`; write `course_id,title,week_number,created_by`. | SELECT ordered by `week_number,title`; admin INSERT. | FK to `courses`; RLS enabled with no policy in Phase 3–6 script. |
| `question_bank` | Admin `*`; write `course_id,topic_id,prompt,choices,correct_choice_id,explanation,difficulty,active,created_by`. | SELECT ordered by `created_at`, limit 500; INSERT (single/bulk), UPDATE by `id`, DELETE by `id`. | FK to `courses` and optional `academic_topics`; contains answer key. RLS enabled with no policy in Phase 3–6 script. Do not expose answer keys to an untrusted mobile client. |
| `examinations` | Admin requests `*`; schema fields include competition/course/type/week/title/question count/timing/status. | Admin SELECT ordered by `opens_at`; saves/status changes use admin RPCs. | FKs to `competitions` and `courses`; RLS enabled with no policy in Phase 3–6 script. |
| `examination_sessions` | Admin monitoring requests `*`; UI reads `id,user_id,examination_id,status,started_at,deadline_at,interruption_count,risk_flags,score`. Exam session mutations use RPCs. | Admin SELECT ordered by `started_at`, limit 250; student session access via RPC. | FKs to examinations, registrations, users; unique exam/registration. RLS enabled with no policy in Phase 3–6 script. |
| `competition_results` | Student and admin screens request `*`; consumed fields include `id,competition_id,user_id,rank_number,final_score,is_winner,reward_amount_etb,finalized_at`. | Student SELECT by own `user_id`, ordered by `finalized_at`; admin SELECT all ordered/limited. Finalization via RPC. | FKs to snapshots, competitions, users; unique `(competition_id,user_id)`. RLS enabled with no policy in Phase 3–6 script. |
| `payouts` | Student/admin screens request `*`; consumed fields include `id,result_id,competition_id,user_id,amount_etb,status,transaction_reference,note,created_at,paid_at`. | Student SELECT by own `user_id`; admin SELECT all ordered/limited. Updates via `admin_update_payout`. | FKs to result, competition, user; RLS enabled in Phase 3–6. Latest checked-in migration adds admin-only SELECT policy, but no student SELECT policy is defined in that migration. |
| `notifications` | UI requests `*`; reads `id,user_id,title,body,category,related_id,read_at,created_at`. | SELECT own rows by `user_id`, newest first, limit 100. UPDATE `read_at` by notification `id`; mark-all UPDATE rows for user where `read_at IS NULL`. Admin notification delivery via RPC. | FK to auth user. RLS enabled in Phase 3–6 script; no policy found there. |
| `refunds` | Admin requests `*`; consumes payment/competition/user/amount/status/external reference/note/timestamps. | Admin SELECT ordered by `created_at`, limit 300; status transition via `admin_update_refund`. | FKs to payment, competition, user; RLS enabled in Phase 3–6 script, no policy defined there. |
| `payment_receipts` | Admin SELECT: `payment_id,object_path,mime_type`. | Admin SELECT by payment IDs; then creates a 300-second signed Storage URL for each `object_path`. | FK to `payments`; one receipt per payment, user ID and path recorded. RLS enabled in Phase 3–6 script, no policy defined there. |
| `audit_logs` | Admin `*`; admin audit joins/looks up profile `id,full_name`. | Admin SELECT ordered newest first, limit 500. No frontend write. | FK actor to auth user. RLS enabled; checked-in migration adds admin-only SELECT. |
| `weekly_operations` | Admin requests `*`. | Admin SELECT ordered newest first. Create/open via RPC. | FK to competition; RLS enabled in Phase 3–6 script, no policy defined there. |
| `weekly_operation_steps` | Admin requests `*`; consumes `operation_id,step_order,step_key,status,notes,linked_competition_id`. | Admin SELECT filtered by `operation_id`, ordered by `step_order`; completion via RPC. | FK to weekly operation and optional linked competition; RLS enabled in Phase 3–6 script, no policy defined there. |
| `study_documents_metadata` | `id,user_id,title,file_name,file_type,size_bytes,last_opened_at,created_at,updated_at,deleted_at`. | UPSERT one or batches (max batch 100) on conflict `id`; client does not store file bytes here. | FK to auth user; composite `(user_id,id)` supports session ownership. RLS SELECT/INSERT/UPDATE own rows; no DELETE policy, and SQL revokes all then grants only SELECT/INSERT/UPDATE. |
| `study_sessions` | Read: `active_seconds,started_at,validation_status`; RPC payload also has `id,document_id,ended_at,interaction_count,pages_viewed`. | SELECT by `user_id`, `validation_status='accepted'`, `started_at >= last 7 days`, newest first, limit 250. Session writes are only through `sync_study_sessions`. | FK to user's document metadata; RLS SELECT own rows only. Table writes are not granted to client. |
| `daily_streak_registry` | `study_date,active_seconds,qualifying`. | SELECT by `user_id`, newest study date first, limit 35. No direct writes. | RLS SELECT own rows only; writes are server function-owned. |

### SQL-owned tables used behind database functions

These are defined in checked-in SQL but are not queried directly by frontend `.from(...)` calls. `sync_study_sessions`, `get_bravo_wallet`, and `admin_dashboard_metrics` do use some of them internally. Other domain RPCs may use them, but their bodies are not checked in.

| Table | Columns in checked-in SQL | Access notes |
|---|---|---|
| `weekly_bravo_balances` | `user_id,week_start,study_seconds,study_bravos,unique_document_bravos,consistency_bravos,total_bravos,updated_at` | RLS SELECT own rows; no client DML grants. Updated by `sync_study_sessions`. |
| `weekly_document_activity` | `user_id,week_start,document_id,active_seconds,unique_rewarded` | RLS enabled with no client policy/grant; internal reward ledger. |
| `bravo_transactions` | `id,user_id,week_start,category,source_key,description,amount,created_at` | RLS SELECT own rows; no client writes. |
| `study_sync_logs` | `id,user_id,session_id,validation_status,risk_flags,created_at` | RLS enabled without client policy/grants; internal diagnostics. |
| `examination_questions` | `session_id,position,question_id,prompt_snapshot,choices_snapshot,correct_choice_id,question_starts_at,question_deadline_at` | Internal exam snapshot/answer-key table; not directly queried by UI. RLS enabled in Phase 3–6 SQL, no policies there. |
| `examination_answers` | `session_id,position,selected_choice_id,answered_at` | Internal answer table; writes/reads should remain behind authorized exam RPCs. RLS enabled, no policies in Phase 3–6 SQL. |
| `competition_result_snapshots` | `id,competition_id,finalized_by,finalized_at,eligible_count,gross_revenue_etb,reward_pool_etb,platform_allocation_etb,rules_snapshot,created_at` | Result-finalization ledger. RLS enabled, no policies in Phase 3–6 SQL. |
| `financial_transactions` | `id,competition_id,user_id,payment_id,payout_id,refund_id,kind,amount_etb,transaction_reference,occurred_at,created_by,created_at` | Financial ledger; never write from an untrusted client. RLS enabled, no policies in Phase 3–6 SQL. |

`auth.users` is a Supabase Auth-managed table, not a frontend PostgREST table. It is referenced by triggers and foreign keys; clients must use Auth APIs rather than query or write it.

### RLS and schema caveats

- `supabase/SETUP.sql` defines policies for profiles, roles, classifications, competitions/registrations, and Phase 2 study tables. It intentionally removes the older free student registration INSERT/DELETE policies.
- The Phase 3–6 schema file enables RLS on competitions, registrations, payments, receipts, financial ledger, refunds, academic/exam/result/notification/admin tables, but **does not contain `CREATE POLICY` statements or grants for those tables**. RLS with no applicable policy normally denies API access. The file's schema is not proof of the deployed project's current policy state.
- `PHASES_3_6_SETUP.sql` begins by dropping several existing competition/payment tables with `CASCADE`; do not treat it as a harmless read-only migration or run it against production without an independently reviewed migration plan and backup.
- `20261109120000_admin_dashboard_metrics_and_profile_phone.sql` adds admin-only SELECT policies for `payments`, `payouts`, and `audit_logs`, and defines `admin_dashboard_metrics`. It does not provide a complete policy set for the Phase 3–6 tables.
- Thus student/admin direct table queries for payments, materials, examinations, notifications, results, refunds, and operations may require deployed SQL/policies not present here. Verify the live schema/policies before mobile implementation; this report does not change them.

## 4. RPC/database functions called by frontend

RPC names and argument object keys are **verified frontend calls**. SQL types/return values are only called **verified** when a checked-in function declaration supplies them. The rest are **inferred from JavaScript arguments/UI use**; no implementation or full response schema was found in checked-in SQL.

| Function | Frontend arguments (type) | Return expected by caller / feature | Evidence |
|---|---|---|---|
| `sync_study_sessions` | `p_sessions: jsonb` array of `{id: UUID, document_id: UUID, started_at: timestamp, ended_at: timestamp, active_seconds: integer, interaction_count: integer, pages_viewed: integer}`; batches <=25. | **Verified SQL:** JSONB `{accepted_session_ids: UUID[], flagged_session_ids: UUID[], awarded_bravos: number}`. Writes validated sessions, reward balances/ledger. | SQL definition in study migration/bootstrap; Study Room sync. |
| `get_bravo_wallet` | No arguments. | **Verified SQL:** JSONB with `cycle_start`, `cycle_ends_at`, `study_seconds`, `study_bravos`, `unique_document_bravos`, `consistency_bravos`, `total_bravos`, `weekly_cap`, and `recent_transactions[]` (`id,category,description,amount,created_at`). | SQL definition in study migration/bootstrap; wallet screen. |
| `get_competition_feed` | No arguments. | **Inferred:** array of competition/feed objects; UI uses `id`, `title`, status/timing/type, registration/payment state, fee/capacity, and result metadata as available. Exact contract not found in checked-in SQL. | Competition, leaderboard/rewards screens. |
| `register_for_competition` | `p_competition_id` (UUID value). SQL type not found. | Result ignored except success/error; expected to reserve a registration. Exact response unknown. | Competition registration. |
| `withdraw_competition_registration` | `p_registration_id` (UUID value). | Result ignored; expected to withdraw an eligible unpaid registration. Exact response unknown. | Competition screen. |
| `request_competition_refund` | `p_registration_id` (UUID value). | Result ignored; expected to create a refund request. Exact response unknown. | Competition screen. |
| `submit_competition_payment` | `p_registration_id` (UUID), `p_method` (string: `telebirr` or `cbe_birr`), `p_transaction_reference` (string), `p_receipt_path` (string), `p_mime_type` (string), `p_size_bytes` (number). | Result ignored except success/error; expected to record submission and receipt metadata. Exact response unknown. | Competition payment flow. |
| `get_competition_leaderboard` | `p_competition_id` (UUID value). | **Inferred:** array; UI consumes `rank`/`student_name`/`final_score`/`is_winner`/`reward_amount_etb`. | Student leaderboard and Admin Results. |
| `get_student_exam_feed` | No arguments. | **Inferred:** array of exam rows; UI uses exam IDs, title, competition title/type, and session/status fields. | Student exam screen. |
| `start_examination` | `p_examination_id` (UUID value). | **Inferred:** exam-session JSON object consumed by the exam screen (session ID/status/timing, `server_now`, question list and selected choices). Exact contract unknown. | Student exam start. |
| `get_examination_session` | `p_session_id` (UUID value). | Same inferred session object as above. | Student reconnect/resume. |
| `submit_examination_answer` | `p_session_id` (UUID), `p_position` (number), `p_choice_id` (string). | Result ignored except success/error; UI updates the selected choice locally. | Student exam answer save. |
| `submit_examination` | `p_session_id` (UUID). | **Inferred:** object merged into current session; UI reads status, score, correct_count, total_questions. | Student exam submission/auto-submit. |
| `record_examination_signal` | `p_session_id` (UUID), `p_signal` (string; frontend sends `tab_hidden`, `window_blur`, `connection_lost`). | Result ignored; exact response unknown. | Student exam monitoring. |
| `admin_save_competition` | `p_competition` (JSON object): form includes `id`, `title`, `description`, `competition_type`, `academic_level`, `stream`, registration open/deadline, start/end timestamps, `minimum_participants`. | Result ignored except success/error. Exact SQL type/return unknown. | Admin Competitions. |
| `admin_set_competition_status` | `p_competition_id` (UUID), `p_status` (string). | Result ignored except success/error. | Admin Competitions. |
| `admin_save_examination` | `p_exam` (`jsonb` object): optional `id`; `competition_id`, `course_id`, `exam_type`, nullable `week_number`, `title`, `question_count`, `seconds_per_question`, `opens_at`, `closes_at`, `reconnect_grace_seconds`, `allow_previous_navigation`. | Returns the saved examination UUID. Admin-only; creates drafts or updates existing drafts that have no sessions. | Admin Examinations; `20261111182550_admin_examination_rpcs.sql`. |
| `admin_set_exam_status` | `p_exam_id` (UUID), `p_status` (`scheduled`, `open`, `closed`, or `cancelled`). | `void`; admin-only, with validated status transitions. | Admin Examinations; `20261111182550_admin_examination_rpcs.sql`. |
| `admin_send_notification` | `p_user_id` (UUID or null), `p_title` (string), `p_body` (string), `p_category` (string). | **Inferred:** scalar count; UI interpolates returned `data` as number of recipients. SQL type unknown. | Admin Notifications. |
| `admin_dashboard_metrics` | No arguments. | **Verified SQL:** `jsonb`; UI reads `total_students`, `active_students`, `weekly_participants`, `grand_participants`, `pending_payments`, `verified_payments`, `gross_verified_revenue_etb`, `reward_liabilities_etb`, `pending_payouts`, `recent_activity[]`. Function checks `auth.uid()` and `has_role('admin')`. | SQL migration and Admin Overview. |
| `admin_review_competition_payment` | `p_payment_id` (UUID), `p_decision` (string), `p_note` (string or null). | Result ignored except success/error. Exact SQL contract unknown. | Admin Payments. |
| `admin_update_refund` | `p_refund_id` (UUID), `p_status` (string), `p_reference` (string or null), `p_note` (string or null). | Result ignored except success/error. | Admin Refunds. |
| `admin_update_payout` | `p_payout_id` (UUID), `p_status` (string), `p_reference` (string or null), `p_note` (string or null). | Result ignored except success/error. | Admin Payouts. |
| `admin_financial_report` | `p_from`, `p_to` (ISO timestamp strings or null). | **Inferred:** JSON object with totals (`verified_entry_revenue_etb`, `paid_payouts_etb`, `paid_refunds_etb`, `outstanding_payouts_etb`, `pending_refunds_etb`) and `by_competition[]`. SQL signature/return not checked in. | Admin Reports. |
| `finalize_competition_results` | `p_competition_id` (UUID). | **Inferred:** scalar displayed as a result snapshot identifier; exact SQL type unknown. | Admin Results. |
| `admin_update_system_settings` | `p_settings` (JSON object of settings values). | Result ignored except success/error. | Admin Settings. |
| `admin_open_weekly_operation` | `p_competition_id` (UUID). | **Inferred:** scalar operation ID selected by the UI. | Admin Weekly Operations. |
| `admin_complete_weekly_operation_step` | `p_operation_id` (UUID), `p_step_key` (string), `p_notes` (string or null), `p_linked_competition_id` (UUID or null). | Result ignored except success/error. | Admin Weekly Operations. |

### Function-definition coverage

The frontend invokes the functions above, but checked-in SQL definitions were found only for `sync_study_sessions(jsonb)`, `get_bravo_wallet()`, and `admin_dashboard_metrics()` among these screen-facing RPCs. The repository also defines helper/trigger functions `has_role(_role app_role)`, `set_updated_at()`, and `handle_new_user()`; these are not directly invoked from frontend JavaScript. The other screen RPC definitions/signatures/authorization checks are **not discoverable in checked-in SQL** and must be obtained from the deployed database or the missing SQL source. Do not recreate them from the inferred call shapes.

## 5. Edge Functions

**No Supabase Edge Function invocation was found.** There are no `supabase.functions.invoke(...)` calls or direct `/functions/v1/...` requests in the frontend. Do not assume a payment, exam, or notification Edge Function exists.

## 6. Storage

Storage operations are Supabase Storage SDK calls. The service URLs are standard Supabase Storage routes (**inferred**); bucket names/method calls are **verified in frontend**.

| Bucket | Operation | Path / behavior |
|---|---|---|
| `academic-materials` | Admin upload via `.upload(path,file,{contentType,upsert:false})`; admin delete via `.remove([path])`; student download via `.download(object_path)`. | Admin path: `<course_id>/<uuid>-<sanitized-filename>`. Files are PDF/PPT/PPTX, max 50 MiB in UI. A matching `academic_materials.object_path` metadata row stores `course_id,title,description,mime_type,size_bytes,created_by`. Upload is rolled back from Storage if metadata insert fails. |
| `payment-receipts` | Student upload via `.upload(...,{contentType,cacheControl:'3600',upsert:false})`; app attempts `.remove([path])` if submission RPC fails. Admin creates a 300-second signed URL with `.createSignedUrl(object_path,300)`. | Path: `<auth-user-uuid>/<registration-uuid>/<random-uuid>-<sanitized-filename>`. UI accepts JPEG, PNG, WEBP, PDF, max 5 MiB. Receipt metadata is submitted to `submit_competition_payment` and read from `payment_receipts`. |

No direct Storage bucket policy, public/private flag, or bucket configuration is checked into `supabase/`. Treat receipts as private: verify deployed Storage policies and do not publish their object paths or replace signed URLs with public URLs. Study Room user-uploaded files are stored locally in browser IndexedDB, **not** in Supabase Storage.

## 7. Feature-to-backend mapping

| Mobile feature | Existing backend calls/data |
|---|---|
| Authentication and account recovery | Supabase Auth email/phone password signup/login, SMS OTP verification, email recovery, phone OTP recovery, password update; then `profiles`, `user_roles`, `payments` account load. Preserve the same Auth project so existing user identities remain valid. |
| Student dashboard | Profile/role/payment account load. Study activity reads `study_sessions` and `daily_streak_registry`; Bravo totals via `get_bravo_wallet`. Dashboard display beyond these may be local UI state. |
| Competitions and registration | `get_competition_feed`; `register_for_competition`; `withdraw_competition_registration`; `request_competition_refund`; `system_settings` for payment instructions; `payments` for own submissions/status. |
| Examinations | Student `get_student_exam_feed`, `start_examination`, `get_examination_session`, `submit_examination_answer`, `submit_examination`, `record_examination_signal`. Admin screens use examination/question tables and admin save/status RPCs. Keep answer keys and scoring server-side. |
| Leaderboard and rankings | `get_competition_feed`, `get_competition_leaderboard`; own `competition_results` and `payouts` for the rewards view. |
| Study materials and documents | Course materials from `academic_materials` joined to `courses`; download files from `academic-materials`. Personal documents stay on-device (IndexedDB); metadata syncs to `study_documents_metadata`; bounded study sessions use `sync_study_sessions`; wallet uses `get_bravo_wallet`. |
| Payments (Telebirr and CBE Birr) | The frontend displays instructions from `system_settings` keys `telebirr_instructions` and `cbe_birr_instructions`. It does **not** call either payment provider. Student manually transfers funds, uploads receipt to `payment-receipts`, then invokes `submit_competition_payment`. |
| Payment receipts and verification | Student submits reference/path/MIME/size to payment RPC; admin reads payment/receipt rows and opens a short-lived signed URL; admin review uses `admin_review_competition_payment`. Verification is manual in current frontend; actual RPC behavior must be confirmed from deployed SQL. |
| Payouts and refunds | Student reads own result/payout state. Refund request uses `request_competition_refund`; admins use `admin_update_refund`, `finalize_competition_results`, and `admin_update_payout`. UI text describes manual settlement; no external payout/refund provider call is present. |
| Profile and account status | Auth metadata -> database trigger creates profile/student role; frontend loads profile/role and computes verified-payment flag. Account status is read for suspension/admin targeting. No active direct profile editor/write was found beyond the password reset Auth call. |
| Admin functions | Admin route is gated in React by the loaded `account.role`; admin screens invoke dashboard metrics, reporting, competition/exam management, payment/refund review, notification delivery, academic content management, results/payouts, audit, and weekly operations. This UI gate is not an authorization boundary; the server must check admin claims/role and RLS for every admin mutation/read. |

## 8. Security requirements

1. **Public key only:** Use the configured publishable key (or legacy anon key if the project still uses it). Never ship `service_role`, Supabase secret keys, database passwords, SMS-provider credentials, or payment-provider private keys in the APK.
2. **Use a user's access token:** Android Auth requests should operate in that user's session and let Postgres RLS identify `auth.uid()`. Never substitute an elevated key to make a denied query work.
3. **Server-enforce admin authorization:** The client `AdminRoute` is only navigation/UI. All admin RPCs, sensitive table reads, account-role changes, payment decisions, results finalization, payouts, refunds, audit, and settings writes must enforce admin authorization on the server. `admin_dashboard_metrics` is explicitly guarded in checked-in SQL; authorization of other admin RPCs is not verifiable because their definitions are absent.
4. **RLS is required:** Scope profile/payment/result/session/notification reads to the authenticated user. Check the live policies, especially because the checked-in Phase 3–6 script enables RLS without policies and the app calls those tables directly. Do not weaken RLS or add broad authenticated policies just to make the mobile client work.
5. **Do not trust client-calculated outcomes:** Exam scoring, correct answers, result finalization, competition eligibility/capacity/payment state, payout/refund state, Bravos, and audit records must be authoritative server operations. Never write these directly from Android or expose answer keys.
6. **Keep financial and audit tables server-owned:** Payments/transactions/receipts/refunds/payouts and admin settings changes require privileged server-side validation. The visible Telebirr/CBE Birr flow is manual reference-and-receipt submission; it is not proof of payment.
7. **Protect tokens and receipts:** Store refresh/access tokens using Android secure storage backed by Android Keystore; use HTTPS; avoid logging tokens, phone numbers, account numbers, receipt paths, or signed URLs. Signed receipt URLs in this app expire after five minutes.
8. **Account state:** Do not rely on the browser's cached offline profile or client role to authorize mobile operations. Revalidate profile/account status online for protected actions.

## 9. Native Kotlin Android integration recommendation

- Connect to the **same project URL** and use the same public publishable key. This preserves existing Auth accounts and the same Postgres data; it does not require a separate backend.
- Use a maintained Supabase Kotlin client (Auth, PostgREST, Storage) or call documented REST APIs with equivalent JWT handling. Pin a reviewed library version in the Android build and keep dependencies current.
- Implement the same Auth identity flows: email/password and/or phone/password, verification and recovery OTPs where the deployed Auth providers support them, and recovery deep links. Configure Android App Links/deep links and allow the mobile redirect URI in Supabase Auth settings as a separate manual deployment step; the repository only configures website-origin redirects.
- Persist user sessions securely on-device; restore/refresh through the SDK. Never embed privileged credentials. Use the user's bearer token on PostgREST/RPC/Storage calls so RLS applies.
- Treat the verified SDK calls and table filters above as a compatibility reference, but confirm each deployed RPC signature, result shape, bucket policy, and RLS policy before shipping. Several calls are currently unsupported by checked-in SQL evidence.
- Keep server-owned workflows behind the existing RPCs only after verifying their deployed implementations. If a function is absent, coordinate a backend change separately rather than fabricating a client-side replacement or writing sensitive tables directly.
- Confirm production Auth email/phone providers, redirect allowlists, Storage buckets/policies, Data API schema exposure, and RLS in the Supabase project owner console. This report does not change any project setting.

## 10. Repository files reviewed

Frontend: `src/lib/supabase.js`, `src/context/AuthContext.jsx`, Auth/recovery pages, student dashboard/competition/exam/results/notifications/study/wallet pages, admin pages and components, plus route wiring. Backend artifacts: `supabase/config.toml`, `supabase/SETUP.sql`, `supabase/PHASES_3_6_SETUP.sql`, `supabase/migrations/*.sql`, and Supabase setup documentation. The repository inventory did not reveal frontend Edge Function calls or Storage bucket policy definitions.
