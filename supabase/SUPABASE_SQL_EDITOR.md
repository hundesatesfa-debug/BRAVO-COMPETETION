# Supabase SQL Editor setup

## Run the current BRAVO schema

1. Open the intended BRAVO project and branch in Supabase **SQL Editor**.
2. Create a new query and paste the complete [`SETUP.sql`](SETUP.sql) file.
3. Run it once and wait for the transaction to complete.
4. Add the project URL and publishable key to `.env.local` using [`.env.example`](../.env.example).
5. Configure Auth redirects for `/welcome` and `/reset-password`. Phone sign-in and password recovery also need a configured SMS provider.
6. Create an admin account through the normal sign-up form, then promote it with the trusted-owner SQL shown in [`README.md`](README.md).

The script covers the current app tables for profiles, roles, academic levels, streams, competitions, and competition registrations. It creates missing tables and fields, enables Row Level Security, refreshes the app's policies and triggers, and preserves existing rows. Student writes to competition registrations remain disabled until payment verification is implemented.

## Important for an existing project

`SETUP.sql` is designed for the BRAVO schema in this repository. It does not drop tables or delete user data, but it does update triggers, grants, and policies. Review those changes before running against a production branch.

Running SQL in the dashboard does not add entries to Supabase CLI migration history. If the project has existing tables but the migration history is empty, do not immediately run `db push`; the CLI may try to create tables that already exist. Reconcile the migration history before switching that project to CLI-managed migrations.

This schema covers the workflows currently implemented in Phase 1. Study tracking, examinations, payment review, balances, and payouts are later phases and do not have app tables yet.
