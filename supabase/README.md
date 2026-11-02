# Supabase setup

1. Create a Supabase project and copy its project URL and publishable key to `.env.local` using `.env.example`.
2. Apply migrations in order with the Supabase CLI (`supabase link`, then `supabase db push`). This installs the competition manager and registration workflow. For a fresh project using the dashboard, run [`SETUP.sql`](SETUP.sql) once. It contains the full schema and policies.
3. In the Supabase dashboard, open **Authentication → Sign In / Providers → Email** and turn off **Confirm email** to let new accounts log in immediately without a verification email. Keep your production site and redirect URLs configured for password-reset links.
4. Register normally. The database trigger creates the student's profile and student role; the browser cannot assign roles.

There is no shared or default admin login in a fresh project. Create an account with your own email and password, then promote it to admin in the Supabase SQL Editor as a project owner. The app gives admin status to the account with the `admin` role; it does not create or reveal passwords.

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'trusted-admin@example.com'
on conflict do nothing;
```

Never put a service-role key in a `VITE_` variable or browser code. Public role selection is not provided; the default role for registration is always `student`.
