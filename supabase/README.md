# Supabase setup

1. Create a Supabase project and copy its project URL and publishable key to `.env.local` using `.env.example`.
2. Apply migrations in order with the Supabase CLI (`supabase link`, then `supabase db push`). For a fresh project using the dashboard, follow [the SQL Editor setup guide](SUPABASE_SQL_EDITOR.md) and run its complete query once.
3. Configure Auth email confirmation and your production site/redirect URLs in the Supabase dashboard.
4. Register normally. The database trigger creates the student's profile and student role; the browser cannot assign roles.

To promote a trusted account to admin, use the Supabase SQL Editor as a project owner after the account has been created and email confirmed:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'trusted-admin@example.com'
on conflict do nothing;
```

Never put a service-role key in a `VITE_` variable or browser code. Public role selection is not provided; the default role for registration is always `student`.
