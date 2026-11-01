import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const hasSupabaseConfig = Boolean(
  url && publishableKey && !url.includes('your-project') &&
  !publishableKey.includes('your-supabase-publishable-key') &&
  !publishableKey.includes('your-supabase-anon-key'),
);
export const supabase = hasSupabaseConfig
  ? createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
