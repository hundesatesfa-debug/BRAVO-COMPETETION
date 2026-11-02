import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

async function loadAccount(user) {
  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, academic_level, stream, phone_number, cbe_account_number').eq('id', user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ]);
  if (profileError) throw profileError;
  if (roleError) throw roleError;
  if (!roleRows?.length) throw new Error('Your account role could not be loaded.');
  const role = roleRows.some((row) => row.role === 'admin') ? 'admin' : roleRows[0].role;
  return { user, profile, role };
}

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(Boolean(hasSupabaseConfig));
  const [accountError, setAccountError] = useState('');

  const refreshAccount = useCallback(async (user) => {
    if (!user || !supabase) {
      setAccount(null);
      return;
    }
    setAccountError('');
    try {
      const nextAccount = await loadAccount(user);
      setAccount(nextAccount);
      return nextAccount;
    } catch (error) {
      setAccountError(error.message || 'Your profile could not be loaded.');
      setAccount(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;
        if (session?.user) await refreshAccount(session.user);
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setAccountError(error.message || 'Your session could not be checked.');
        setLoading(false);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setAccount(null);
        setAccountError('');
        setLoading(false);
        return;
      }
      setTimeout(() => {
        if (active) refreshAccount(session.user).finally(() => setLoading(false));
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
    setAccount(null);
  }, []);

  const value = useMemo(() => ({
    account,
    loading,
    accountError,
    refreshAccount,
    signOut,
    configured: hasSupabaseConfig,
  }), [account, loading, accountError, refreshAccount, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
