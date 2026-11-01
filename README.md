# BR@VO

BR@VO is a competition-centered academic platform. This repository currently implements **Phase 1: Foundation**: the React app shell, Supabase Auth, student registration and classification, account profiles, and the first RLS-protected database migration.

## Run locally

```sh
npm install
```

Copy `.env.example` to `.env.local`, then set:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's publishable key (safe for browser use when RLS is enabled)

Apply the migration and configure email confirmation and redirect URLs as described in [`supabase/README.md`](supabase/README.md). Then start the development server:

```sh
npm run dev
```

Build the production bundle with `npm run build`.

## Security foundation

- Registration always creates a student role in a database trigger. Role assignment is not accepted from the browser.
- Profiles and role rows use RLS. Students read/update only their own profile and read only their own role.
- Students cannot change their academic level or stream from the client; changing classification can be added later through an audited administrative flow.
- Academic level and stream are constrained by database references.
- The frontend uses only Supabase's public anon key. Never expose the service-role key.

## Current scope

The competition, payment, practice, examination, leaderboard, rewards, and AI workflows are not yet connected. The dashboard currently identifies the student's classification and account; future phases will add those workflows against verified backend data. No demo competitions or payment outcomes are fabricated.
