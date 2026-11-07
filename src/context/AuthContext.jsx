
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);
const OFFLINE_PROFILE_PREFIX = 'bravo-offline-profile:';

function cacheOfflineProfile(account) {
  try {
    localStorage.setItem(`${OFFLINE_PROFILE_PREFIX}${account.user.id}`, JSON.stringify({
      role: account.role,
      profile: {
        id: account.user.id,
        full_name: account.profile.full_name,
        academic_level: account.profile.academic_level,
        stream: account.profile.stream,
        school_name: account.profile.school_name,
        account_status: account.profile.account_status || 'active',
        account_status_note: account.profile.account_status_note || null,
      },
    }));
  } catch {
    // Browser storage may be disabled; online sign-in still works.
  }
}

function readOfflineProfile(user) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${OFFLINE_PROFILE_PREFIX}${user.id}`) || 'null');
    if (!cached?.profile || !['student', 'admin'].includes(cached.role)) return null;
    return {
      user,
      role: cached.role,
      profile: {
        ...cached.profile,
        phone: user.phone || null,
        cbe_account_number: null,
      },
      offline: true,
    };
  } catch {
    return null;
  }
}

async function lookupClassificationName(table, id) {
  if (id == null || !supabase) return null;
  const { data, error } = await supabase
    .from(table)
    .select('name')
    .eq('id', id)
    .maybeSingle();
  return error ? null : data?.name || null;
}

async function loadAccount(user) {
  const [
    { data: profile, error: profileError },
    { data: roleRows, error: roleError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),

    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id),
  ]);

  if (profileError?.code === 'PGRST116') {
    throw new Error('No profile row exists for this account. Run the latest supabase/SETUP.sql in your Supabase SQL Editor to repair existing accounts.');
  }
  if (profileError) throw profileError;
  if (roleError) throw roleError;

  const [levelLookup, streamLookup] = await Promise.all([
    profile.academic_level || profile.academic_level_id == null
      ? Promise.resolve(null)
      : lookupClassificationName('academic_levels', profile.academic_level_id),
    profile.stream || profile.stream_id == null
      ? Promise.resolve(null)
      : lookupClassificationName('streams', profile.stream_id),
  ]);

  const role = roleRows?.some((row) => row.role === 'admin')
    ? 'admin'
    : roleRows?.[0]?.role || 'student';
  const rawLevel = profile.academic_level ?? profile.academic_level_id ?? null;
  const rawStream = profile.stream ?? profile.stream_id ?? null;

  return {
    user,
    profile: {
      ...profile,
      phone: profile.phone_number || profile.phone || user.phone || null,
      school_name: profile.school_name || null,
      cbe_account_number: profile.cbe_account_number || null,
      academic_level: rawLevel === 'grade_12' || rawLevel === 'Grade 12'
        ? 'Grade 12'
        : rawLevel === 'freshman' || rawLevel === 'University Freshman'
          ? 'University Freshman'
          : levelLookup || rawLevel,
      stream: rawStream === 'natural_science' || rawStream === 'Natural Science'
        ? 'Natural Science'
        : rawStream === 'social_science' || rawStream === 'Social Science'
          ? 'Social Science'
          : streamLookup || rawStream,
    },
    role,
  };
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(Boolean(hasSupabaseConfig));
  const [accountError, setAccountError] = useState('');

  const refreshAccount = useCallback(async (user) => {
    if (!user || !supabase) {
      setAccount(null);
      return null;
    }

    setAccountError('');

    try {
      const nextAccount = await loadAccount(user);
      cacheOfflineProfile(nextAccount);
      setAccount(nextAccount);
      return nextAccount;
    } catch (error) {
      const cachedAccount = readOfflineProfile(user);
      if (cachedAccount) {
        setAccountError('Using the saved profile while BRAVO is offline.');
        setAccount(cachedAccount);
        return cachedAccount;
      }
      setAccountError(error.message || 'Your profile could not be loaded.');
      setAccount(null);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;

        if (session?.user) {
          await refreshAccount(session.user);
        }

        if (active) setLoading(false);
      })
      .catch((error) => {
        if (!active) return;

        setAccountError(error.message || 'Your session could not be checked.');
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session?.user) {
        setAccount(null);
        setAccountError('');
        setLoading(false);
        return;
      }

      setTimeout(() => {
        if (active) {
          refreshAccount(session.user).catch(() => {}).finally(() => {
            if (active) setLoading(false);
          });
        }
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshAccount]);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    try {
      localStorage.removeItem(`${OFFLINE_PROFILE_PREFIX}${account?.user.id}`);
    } catch {
      // The auth session is already cleared; local profile cleanup is best-effort.
    }
    setAccount(null);
  }, [account]);

  const value = useMemo(() => ({
    account,
    loading,
    accountError,
    refreshAccount,
    signOut,
    configured: hasSupabaseConfig,
  }), [account, loading, accountError, refreshAccount, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
