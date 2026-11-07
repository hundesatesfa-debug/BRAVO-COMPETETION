import { useCallback, useEffect, useState } from 'react';
import { Award, BookOpen, CalendarCheck2, Coins, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { loadBravoWallet, loadStudyActivity } from '../lib/studySync.js';

const rewardRows = [
  { key: 'study_bravos', label: 'Focused study time', detail: '1 Bravo per 10 active minutes · weekly limit 50', icon: BookOpen, cap: 50 },
  { key: 'unique_document_bravos', label: 'New study materials', detail: '2 Bravos for each material studied 15 minutes · weekly limit 30', icon: Award, cap: 30 },
  { key: 'consistency_bravos', label: 'Daily consistency', detail: '4 Bravos for each qualifying day · weekly limit 20', icon: CalendarCheck2, cap: 20 },
];

function formatMinutes(seconds = 0) {
  const total = Math.floor(Number(seconds) / 60);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function formatDate(date) {
  if (!date) return '—';
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function BravoWalletPage() {
  const { account } = useAuth();
  const userId = account?.user.id;
  const isOnline = useOnlineStatus();
  const [wallet, setWallet] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activityError, setActivityError] = useState('');

  const refresh = useCallback(async (manual = false) => {
    if (!userId) return;
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');
    setActivityError('');
    const [walletResult, activityResult] = await Promise.allSettled([
      loadBravoWallet(userId),
      loadStudyActivity(userId),
    ]);
    if (walletResult.status === 'fulfilled') setWallet(walletResult.value);
    else setError(walletResult.reason?.message || 'Your Bravo wallet could not be loaded.');
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
    else setActivityError(activityResult.reason?.message || 'Recent study activity is unavailable offline.');
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const total = Number(wallet?.total_bravos || 0);
  const weeklySeconds = Number(wallet?.study_seconds || 0);
  const qualifyingDays = (activity?.days || []).filter((day) => (
    day.qualifying && day.study_date >= (wallet?.cycle_start || '') && day.study_date < (wallet?.cycle_ends_at || '9999-12-31')
  )).length;
  const recentSessions = activity?.sessions || [];

  return (
    <section className="bravo-wallet-page">
      <header className="study-page-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" /> YOUR STUDY REWARDS</div>
          <h2>Bravo Wallet</h2>
          <p>Track weekly study points and the activity that earned them.</p>
        </div>
        <button className="button button-outline button-small" type="button" onClick={() => refresh(true)} disabled={refreshing || !isOnline}>
          <RefreshCw size={14} className={refreshing ? 'is-spinning' : ''} /> Refresh
        </button>
      </header>

      {wallet?.is_cached && <div className="study-message"><WifiOff size={15} /> Offline wallet · last saved {wallet.cached_at ? new Date(wallet.cached_at).toLocaleString() : 'previously'}.</div>}
      {error && <div className="study-message study-message-error" role="alert">{error}</div>}

      <div className="wallet-hero">
        <div className="wallet-coin"><Coins size={25} /></div>
        <div className="wallet-total-copy">
          <span>BRAVOS EARNED THIS WEEK</span>
          <strong>{loading ? '—' : total}<small> / 100</small></strong>
          <p>{wallet?.cycle_start ? `${formatDate(wallet.cycle_start)} – ${formatDate(wallet.cycle_ends_at)}` : 'Weekly cycle · Africa/Addis Ababa'}</p>
        </div>
        <div className="wallet-progress-ring" style={{ '--wallet-progress': `${Math.min(total, 100)}%` }}>
          <span>{loading ? '—' : `${Math.max(0, 100 - total)}`}<small>left</small></span>
        </div>
      </div>

      <div className="wallet-stat-strip">
        <div><span>ACTIVE STUDY TIME</span><strong>{loading ? '—' : formatMinutes(weeklySeconds)}</strong></div>
        <div><span>QUALIFYING DAYS</span><strong>{loading ? '—' : `${Math.min(qualifyingDays, 5)} / 5`}</strong></div>
        <div><span>RECENT SESSIONS</span><strong>{loading ? '—' : recentSessions.length}</strong></div>
      </div>

      <div className="wallet-section-heading"><div className="eyebrow">WEEKLY REWARD RULES</div><span>100 Bravo maximum</span></div>
      <div className="wallet-reward-list">
        {rewardRows.map(({ key, label, detail, icon: Icon, cap }) => {
          const amount = Number(wallet?.[key] || 0);
          return <article className="wallet-reward-row" key={key}>
            <span className="wallet-reward-icon"><Icon size={17} /></span>
            <div className="wallet-reward-copy"><strong>{label}</strong><p>{detail}</p><div className="wallet-reward-progress"><span style={{ width: `${Math.min(100, amount / cap * 100)}%` }} /></div></div>
            <strong className="wallet-reward-count">{loading ? '—' : `${amount} / ${cap}`}</strong>
          </article>;
        })}
      </div>

      <section className="wallet-transactions">
        <div className="wallet-section-heading"><div><div className="eyebrow">RECENT REWARDS</div><h3>Wallet activity</h3></div></div>
        {loading ? <div className="study-empty-state"><span className="loading-inline" /> Loading wallet activity…</div>
          : wallet?.recent_transactions?.length ? <div className="wallet-transaction-list">
            {wallet.recent_transactions.map((transaction) => <article key={transaction.id} className="wallet-transaction-row">
              <span className="wallet-transaction-icon"><Coins size={16} /></span>
              <div><strong>{transaction.description}</strong><small>{new Date(transaction.created_at).toLocaleString()}</small></div>
              <b>+{transaction.amount}</b>
            </article>)}
          </div> : <div className="study-empty-state"><span className="study-empty-icon"><Coins size={20} /></span><h3>No Bravos yet this week</h3><p>Read a study material in the Study Room to start earning.</p></div>}
      </section>

      {activityError && <p className="wallet-activity-hint"><WifiOff size={14} /> {activityError}</p>}
      <div className="wallet-notice"><ShieldCheck size={16} /><p>Bravos are study engagement points. They are not cash, exam marks, or a promise of a payout. Weekly limits are enforced by the server.</p></div>
    </section>
  );
}
