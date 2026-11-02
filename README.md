# BR@VO

BR@VO is a competition-centered academic platform. This repository includes the app foundation and a Supabase-backed competition workflow: administrators can manage events, and eligible students can register for them.

## Run locally

```sh
npm install
```

Copy `.env.example` to `.env.local`, then set:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the project's publishable key (safe for browser use when RLS is enabled)

Apply the migration and turn off email confirmation as described in [`supabase/README.md`](supabase/README.md) if you want accounts to log in immediately after registration. Then start the development server:

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

Competition management and student registration are connected after the latest Supabase migration is applied. Timed examinations, results and leaderboards, payments, rewards, and AI tutoring are not yet connected. Learning cards on the landing page are marked as previews; no demo events or payment outcomes are fabricated.
