# Supabase SQL Editor setup

## Run the current BRAVO schema

1. Open the intended BRAVO project and branch in Supabase **SQL Editor**.
2. Create a new query and paste the complete [`SETUP.sql`](SETUP.sql) file.
3. Run it once and wait for the transaction to complete.
4. Add the project URL and publishable key to `.env.local` using [`.env.example`](../.env.example).
5. Configure Auth redirects for `/welcome` and `/reset-password`. Phone sign-in and password recovery also need a configured SMS provider.
6. Create an admin account through the normal sign-up form, then promote it with the trusted-owner SQL shown in [`README.md`](README.md).

The script covers profiles, roles, academic levels, streams, competitions, competition registrations, study material metadata, study sessions, Bravo balances, streaks, and Bravo transactions. It creates missing tables and fields, repairs missing profile and student-role rows for existing Auth users, enables Row Level Security, refreshes the app's policies and triggers, and preserves existing rows. Material files stay in browser storage; the database stores metadata and session stats. Student writes to competition registrations remain disabled until payment verification is implemented.

## Important for an existing project

`SETUP.sql` is designed for the BRAVO schema in this repository. It does not drop tables or delete user data, but it does update triggers, grants, and policies. Review those changes before running against a production branch.

Running SQL in the dashboard does not add entries to Supabase CLI migration history. If the project has existing tables but the migration history is empty, do not immediately run `db push`; the CLI may try to create tables that already exist. Reconcile the migration history before switching that project to CLI-managed migrations.

The Phase 2 session sync and wallet features call Postgres functions through Supabase's Data API. Make sure the `public` schema is enabled in the intended project's Data API settings. SQL grants and RLS policies are included in `SETUP.sql` and the Phase 2 migration.
