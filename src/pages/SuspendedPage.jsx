import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SuspendedPage() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true); setError('');
    try { await signOut(); navigate('/login', { replace: true }); }
    catch (signOutError) { setError(signOutError.message); setBusy(false); }
  }

  return <main className="suspended-screen"><Brand /><section className="suspended-card"><div className="panel-icon gold-icon"><ShieldAlert size={22} /></div><div className="eyebrow">ACCOUNT ACCESS</div><h1>Account temporarily unavailable</h1><p>{account?.profile?.account_status_note || 'Your BRAVO Academy account is paused. Contact support if you need help.'}</p>{error && <Notice>{error}</Notice>}<button className="button button-primary" onClick={leave} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button></section></main>;
}
