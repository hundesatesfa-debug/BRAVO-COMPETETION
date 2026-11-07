# Supabase setup

1. Create a Supabase project and copy its project URL and publishable key to `.env.local` using `.env.example`.
2. Choose one database setup path. In the Supabase SQL Editor, run [`SETUP.sql`](SETUP.sql) for a fresh project or an existing BRAVO database missing the current profile fields. It includes the Phase 2 Study Room and Bravo Wallet schema. For a project already managed by this repository's migration history, link the project and apply pending migrations with `npx supabase@3.0.0 db push --remote`.
3. In **Authentication → URL Configuration**, set the Site URL to your production Vercel domain and add the production URL, `http://localhost:5173/welcome`, and `http://localhost:5173/reset-password` to the allowed Redirect URLs. Include equivalent redirect URLs for your deployed preview environments.
4. Email and password sign-in works with Supabase Email Auth. Keep email confirmation enabled for production. Phone and password sign-in requires the Phone provider and a configured SMS provider in Supabase Auth; SMS costs and delivery depend on that provider.
5. Register normally. All students provide a 13-digit CBE account number. Grade 12 students also provide a school name; freshmen are not asked for a school or university. The database trigger validates the profile and creates the student role; the browser cannot assign roles.

There is no shared or default admin login in a fresh project. Create an account with your own email or verified phone and password, then promote it to admin in the Supabase SQL Editor as a project owner. The app gives admin status to the account with the `admin` role; it does not create or reveal passwords.

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'trusted-admin@example.com'
on conflict do nothing;
```

Never put a service-role key in a `VITE_` variable or browser code. Public role selection is not provided; the auth trigger assigns `student` regardless of submitted user metadata. Student IDs are optional and are visible only to the account owner and authorized administrators.

CLI v3 database commands target the local stack by default. Use `--remote` when you intend to reach the hosted project, and review its confirmation before applying migrations.

`SETUP.sql` is an idempotent SQL Editor setup for the BRAVO schema. It preserves rows, creates missing app tables, adds the student profile fields, repairs missing profile and student-role rows for existing Auth users, refreshes policies and triggers, disables unpaid student registration writes, and creates the Phase 2 study and Bravo tables. Study documents are stored in browser IndexedDB, not Supabase Storage. The session sync and wallet RPCs require the `public` schema to be available in the project's Data API settings as well as the grants in SQL. Running setup in the SQL Editor does not populate Supabase CLI migration history. Do not run `db push` against a database with an empty or mismatched migration history until that history has been reconciled; otherwise the CLI may try to recreate existing tables.
