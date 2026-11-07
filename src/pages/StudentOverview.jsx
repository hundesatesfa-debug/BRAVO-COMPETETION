import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Coins, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getLocalStudySummary } from '../lib/studyStore.js';
import { loadBravoWallet } from '../lib/studySync.js';

function formatMinutes(seconds = 0) {
  const total = Math.floor(Number(seconds) / 60);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

export default function StudentOverview({ userId }) {
  const [summary, setSummary] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getLocalStudySummary(userId),
      loadBravoWallet(userId),
    ]).then(([localResult, walletResult]) => {
      if (!active) return;
      if (localResult.status === 'fulfilled') setSummary(localResult.value);
      if (walletResult.status === 'fulfilled') setWallet(walletResult.value);
      setBusy(false);
    });
    return () => { active = false; };
  }, [userId]);

  return (
    <section className="student-overview-grid" aria-label="Study overview">
      <article className="overview-stat-card overview-wallet-card">
        <div className="overview-card-icon"><Coins size={18} /></div>
        <span className="overview-card-label">BRAVOS THIS WEEK</span>
        <strong>{busy ? '—' : Number(wallet?.total_bravos || 0)}</strong>
        <p>{wallet?.is_cached ? 'Showing the last saved balance.' : 'Earned by studying consistently.'}</p>
        <Link to="/bravos">View wallet <ArrowRight size={14} /></Link>
      </article>
      <article className="overview-stat-card">
        <div className="overview-card-icon"><BookOpen size={18} /></div>
        <span className="overview-card-label">MY MATERIALS</span>
        <strong>{busy ? '—' : Number(summary?.document_count || 0)}</strong>
        <p>Saved in this browser for offline reading.</p>
        <Link to="/materials">Open library <ArrowRight size={14} /></Link>
      </article>
      <article className="overview-stat-card">
        <div className="overview-card-icon"><RefreshCw size={18} /></div>
        <span className="overview-card-label">SYNC QUEUE</span>
        <strong>{busy ? '—' : Number(summary?.pending_session_count || 0)}</strong>
        <p>{summary?.pending_session_count
          ? `${formatMinutes(summary.pending_active_seconds)} saved for sync.`
          : 'Study activity waiting to sync.'}</p>
        <Link to="/study-room">Continue studying <ArrowRight size={14} /></Link>
      </article>
      {wallet?.is_cached && <div className="overview-offline-note"><WifiOff size={14} /> Wallet balance is cached from {wallet.cached_at ? new Date(wallet.cached_at).toLocaleString() : 'your last online visit'}.</div>}
    </section>
  );
}
