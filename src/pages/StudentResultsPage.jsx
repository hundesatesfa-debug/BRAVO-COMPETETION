import { useCallback, useEffect, useState } from 'react';
import { Medal, Trophy, WalletCards } from 'lucide-react';
import { Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function StudentResultsPage({ mode = 'leaderboard' }) {
  const { account } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [results, setResults] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    if (mode === 'leaderboard') {
      const { data, error: feedError } = await supabase.rpc('get_competition_feed');
      if (feedError) setError(feedError.message);
      const rows = (Array.isArray(data) ? data : []).filter((row) => ['completed', 'archived'].includes(row.status));
      setCompetitions(rows);
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
    } else {
      const [resultData, payoutData] = await Promise.all([
        supabase.from('competition_results').select('*').eq('user_id', account.user.id).order('finalized_at', { ascending: false }),
        supabase.from('payouts').select('*').eq('user_id', account.user.id).order('created_at', { ascending: false }),
      ]);
      if (resultData.error || payoutData.error) setError(resultData.error?.message || payoutData.error?.message || 'Results could not be loaded.');
      setResults(resultData.data || []);
      setPayouts(payoutData.data || []);
      const feed = await supabase.rpc('get_competition_feed');
      setCompetitions(Array.isArray(feed.data) ? feed.data : []);
    }
    setLoading(false);
  }, [mode, account.user.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    async function getBoard() {
      if (mode !== 'leaderboard' || !selectedId) { setLeaderboard([]); return; }
      const { data, error: boardError } = await supabase.rpc('get_competition_leaderboard', { p_competition_id: selectedId });
      if (!active) return;
      if (boardError) setError(boardError.message);
      setLeaderboard(Array.isArray(data) ? data : []);
    }
    getBoard();
    return () => { active = false; };
  }, [mode, selectedId]);

  const competitionMap = Object.fromEntries(competitions.map((competition) => [competition.id, competition]));
  const payoutMap = Object.fromEntries(payouts.map((payout) => [payout.result_id, payout]));

  return mode === 'leaderboard' ? (
    <section className="operational-page" aria-labelledby="leaderboard-title">
      <div className="dashboard-section-heading"><div><div className="eyebrow">FINAL RESULTS</div><h1 id="leaderboard-title">Leaderboard</h1></div><span className="section-note">Published results are read-only snapshots.</span></div>
      {error && <Notice>{error}</Notice>}
      <label className="field-label leaderboard-select">Competition
        <select className="competition-input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {competitions.length === 0 && <option value="">No published results</option>}
          {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.title}</option>)}
        </select>
      </label>
      {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading leaderboard…</div> : leaderboard.length === 0 ? (
        <div className="competition-empty"><Trophy size={22} /><h3>Results will appear here</h3><p>Administrators publish a final result snapshot after the competition closes.</p></div>
      ) : <div className="leaderboard-list">{leaderboard.map((row, index) => <article className={`leaderboard-row${row.is_winner ? ' leaderboard-winner' : ''}`} key={`${row.rank}-${row.student_name}-${index}`}>
        <span className="leaderboard-rank">{row.rank}</span><span className="leaderboard-medal">{row.rank === 1 ? <Trophy size={18} /> : row.is_winner ? <Medal size={18} /> : null}</span>
        <strong>{row.student_name}</strong><span className="leaderboard-score">{Number(row.final_score).toFixed(2)}%</span>
        {row.is_winner && <span className="leaderboard-prize">ETB {Number(row.reward_amount_etb).toFixed(2)}</span>}
      </article>)}</div>}
    </section>
  ) : (
    <section className="operational-page" aria-labelledby="rewards-title">
      <div className="dashboard-section-heading"><div><div className="eyebrow">RESULTS & PAYOUTS</div><h1 id="rewards-title">My rewards</h1></div><WalletCards size={22} /></div>
      {error && <Notice>{error}</Notice>}
      {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading your rewards…</div> : results.length === 0 ? (
        <div className="competition-empty"><Medal size={22} /><h3>No finalized competition results yet</h3><p>Your rank and any cash prize are shown here after an administrator publishes results.</p></div>
      ) : <div className="operational-list">{results.map((result) => {
        const competition = competitionMap[result.competition_id];
        const payout = payoutMap[result.id];
        return <article className="operational-card reward-result-card" key={result.id}>
          <div className="operational-card-main"><div className="panel-icon gold-icon"><Trophy size={17} /></div><div><span className="eyebrow">{competition?.competition_type === 'grand_milestone' ? 'GRAND COMPETITION' : 'WEEKLY ARENA'}</span><h2>{competition?.title || 'Competition'}</h2><p>Final rank #{result.rank_number} · score {Number(result.final_score).toFixed(2)}%</p></div></div>
          <div className="reward-result-value"><strong>{result.is_winner ? `ETB ${Number(result.reward_amount_etb).toFixed(2)}` : 'No prize'}</strong><span>{result.is_winner ? `Payout ${payout?.status || 'pending'}` : 'Finalized result'}</span></div>
          {payout && <div className="operational-card-meta"><span>Prize is sent manually after results are checked.</span>{payout.transaction_reference && <span>Reference: {payout.transaction_reference}</span>}{payout.paid_at && <span>Paid {formatDate(payout.paid_at)}</span>}{payout.note && <span>{payout.note}</span>}</div>}
        </article>;
      })}</div>}
    </section>
  );
}
