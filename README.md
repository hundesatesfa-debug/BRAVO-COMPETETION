# BRAVO Academy

BRAVO Academy is a responsive web platform for Ethiopian students. It includes a public product site, Supabase authentication, student profiles, role-controlled access, a local-first Study Room, offline study tracking, and a Bravo Wallet alongside the competition workspace.

## Run locally

```sh
npm install
```

Copy `.env.example` to `.env.local`, then set:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's public publishable key

Set up the database with the complete [`supabase/SETUP.sql`](supabase/SETUP.sql) script in the Supabase SQL Editor, then start the development server. If the project is already managed by this repository's migration history, use the CLI path documented in [`supabase/README.md`](supabase/README.md) instead.

```sh
npm run dev
```

The SQL Editor script preserves existing rows but does not populate Supabase CLI migration history. Do not run `db push` against a database with an empty or mismatched migration history until that history has been reconciled. Supabase CLI v3 requires `--remote` for hosted database changes and prompts for confirmation.

For Supabase Auth, allow `/welcome` and `/reset-password` as redirect destinations. Keep email confirmation enabled for production. Phone registration, login, and password recovery require the Phone provider and a configured SMS provider. See [`supabase/README.md`](supabase/README.md) for setup details.

Build the production bundle with `npm run build`.

## Deploy on Vercel

Import this repository into Vercel with the repository root as the project root. The included [`vercel.json`](vercel.json) builds with `npm run build`, publishes `dist`, and routes app URLs back to the React app.

Before deploying, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in **Vercel → Project Settings → Environment Variables** for every environment you use. These values are embedded in the browser build. Never add a Supabase secret or service-role key to a `VITE_` variable.

## Security foundation

- New users receive the `student` role from a database trigger; the browser cannot assign roles.
- Profiles and role rows have Row Level Security. Students can read their own profile and can update only the granted display-name and avatar columns.
- Grade 12 school names, academic levels, streams, Ethiopian phone numbers, and 13-digit CBE account numbers are validated in the database trigger. Freshmen are not asked for a university or school name. Student ID is private and optional.
- Admin privileges require a trusted database owner to promote an account. Authorization uses database roles, not user-editable metadata.
- The browser uses only the Supabase publishable key. Sensitive records remain protected by RLS.

## Current scope

Phase 1 covers the public product site, Supabase Auth flows, student onboarding, profile schema, and role/RLS foundation. Phase 2 adds the student dashboard navigation, browser-local PDF/PPT/PPTX library, offline app shell, active study session tracking, and Bravo wallet. Files remain in IndexedDB on the device; only material metadata and session statistics sync to Supabase. Sessions pause when the tab is hidden or unfocused and after three minutes without interaction. The server applies weekly limits of 50 Bravos for study time, 30 for unique materials, and 20 for consistency, with a 100 Bravo total cap. Bravos are engagement points, not money or exam marks.

Competition details are viewable, but the old free sign-up path is disabled until manual payment verification is implemented. Online examinations, result snapshots, payment review, and payout processing are not yet implemented.

Competition rules describe entry fees and revenue allocation, not a guarantee of returns. Before enabling real-money competition, obtain appropriate Ethiopian legal and regulatory advice and publish the final terms, privacy policy, refund rules, dispute process, and contact details.
