import { useCallback, useEffect, useState } from 'react';
import { Download, Medal, Trophy } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

function downloadCsv(filename, rows) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const text = rows.map((row) => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminResults({ payoutsOnly = false }) {
  const [competitions, setCompetitions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [results, setResults] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [competitionMap, setCompetitionMap] = useState({});
  const [selectedId, setSelectedId] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [notes, setNotes] = useState({});
  const [references, setReferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [compResult, payoutResult, resultResult] = await Promise.all([
      supabase.from('competitions').select('*').order('starts_at', { ascending: false }),
      supabase.from('payouts').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('competition_results').select('*').order('finalized_at', { ascending: false }).limit(1000),
    ]);
    const failure = compResult.error || payoutResult.error || resultResult.error;
    if (failure) setError(failure.message);
    const comps = compResult.data || []; const payoutRows = payoutResult.data || []; const resultRows = resultResult.data || [];
    setCompetitions(comps); setPayouts(payoutRows); setResults(resultRows); setCompetitionMap(Object.fromEntries(comps.map((row) => [row.id, row])));
    const ids = [...new Set([...payoutRows.map((row) => row.user_id), ...resultRows.map((row) => row.user_id)])];
    if (ids.length) {
      const { data: profileRows } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids);
      setProfiles(Object.fromEntries((profileRows || []).map((row) => [row.id, row])));
    } else setProfiles({});
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    async function loadBoard() {
      if (!selectedId || payoutsOnly) { setLeaderboard([]); return; }
      const { data, error: boardError } = await supabase.rpc('get_competition_leaderboard', { p_competition_id: selectedId });
      if (!active) return;
      if (boardError) setError(boardError.message);
      setLeaderboard(Array.isArray(data) ? data : []);
    }
    loadBoard(); return () => { active = false; };
  }, [selectedId, payoutsOnly]);

  async function finalize(id) {
    setBusy(id); setError(''); setSuccess('');
    const { data, error: finalizeError } = await supabase.rpc('finalize_competition_results', { p_competition_id: id });
    if (finalizeError) setError(finalizeError.message); else { setSuccess(`Result snapshot ${data} finalized. Prize liabilities were queued for manual payout.`); setSelectedId(id); await load(); }
    setBusy('');
  }

  async function updatePayout(row, status) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: payoutError } = await supabase.rpc('admin_update_payout', {
      p_payout_id: row.id, p_status: status, p_reference: references[row.id] || null, p_note: notes[row.id] || null,
    });
    if (payoutError) setError(payoutError.message); else { setSuccess(`Payout marked ${status}.`); await load(); }
    setBusy('');
  }

  function exportLedger() {
    const resultById = Object.fromEntries(results.map((row) => [row.id, row]));
    const rows = [['Student name', 'Phone', 'Competition', 'Rank', 'Reward ETB', 'Payout status', 'Payout transaction reference']];
    for (const payout of payouts) {
      const result = resultById[payout.result_id]; const profile = profiles[payout.user_id];
      rows.push([profile?.full_name, profile?.phone, competitionMap[payout.competition_id]?.title, result?.rank_number, payout.amount_etb, payout.status, payout.transaction_reference]);
    }
    downloadCsv('bravo-winner-ledger.csv', rows);
  }

  if (payoutsOnly) return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">MANUAL SETTLEMENT</div><h1>Payout management</h1></div><button className="button button-outline button-compact" onClick={exportLedger} disabled={!payouts.length}><Download size={15} /> Winner ledger CSV</button></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading payouts…</div> : payouts.length === 0 ? <div className="competition-empty"><Medal size={22} /><h3>No payout records</h3><p>Finalize competition results to create a reviewable winner ledger.</p></div> : <div className="admin-payment-list">{payouts.map((row) => <article className="admin-payment-card" key={row.id}>
      <div className="admin-payment-top"><div><span className={`status-pill status-${row.status}`}>{row.status}</span><h2>{competitionMap[row.competition_id]?.title || 'Competition'}</h2><p>{profiles[row.user_id]?.full_name || 'Student'} · Rank #{results.find((result) => result.id === row.result_id)?.rank_number || '—'}</p></div><strong>ETB {Number(row.amount_etb).toFixed(2)}</strong></div>
      {row.status !== 'paid' && <><div className="admin-row-actions"><button className="button button-outline button-compact" disabled={busy === row.id || row.status === 'processing'} onClick={() => updatePayout(row, 'processing')}>Mark processing</button><button className="button button-danger button-compact" disabled={busy === row.id || row.status === 'failed'} onClick={() => updatePayout(row, 'failed')}>Mark failed</button></div>
        <label className="field-label admin-note-field">Payout transaction reference (required to mark paid)<input className="competition-input" value={references[row.id] || ''} onChange={(event) => setReferences((state) => ({ ...state, [row.id]: event.target.value }))} maxLength={120} /></label>
        <label className="field-label admin-note-field">Payout note<input className="competition-input" value={notes[row.id] || ''} onChange={(event) => setNotes((state) => ({ ...state, [row.id]: event.target.value }))} maxLength={500} /></label>
        <button className="button button-primary button-compact" disabled={busy === row.id || !references[row.id]?.trim()} onClick={() => updatePayout(row, 'paid')}>Confirm paid</button>
      </>}
      {row.transaction_reference && <div className="admin-payment-detail-grid"><span>Transfer reference<strong>{row.transaction_reference}</strong></span><span>Paid at<strong>{row.paid_at ? new Date(row.paid_at).toLocaleString() : '—'}</strong></span><span>Admin note<strong>{row.note || '—'}</strong></span></div>}
    </article>)}</div>}
  </section>;

  const eligibleForFinalization = competitions.filter((row) => ['active', 'registration_closed'].includes(row.status));
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">PHASE 4 · SERVER RESULTS</div><h1>Results & rankings</h1></div></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">FINALIZE</div><h2>Competition result snapshots</h2></div></div>
      {eligibleForFinalization.length === 0 ? <p className="empty-copy">No competitions are ready for result finalization.</p> : <div className="admin-action-list">{eligibleForFinalization.map((row) => <article key={row.id}><div><strong>{row.title}</strong><small>{row.competition_type === 'weekly_arena' ? 'Weekly Arena · 10 ETB · top 10%' : 'Grand Competition · 100 ETB · 95/5 score'} · ends {new Date(row.ends_at).toLocaleDateString()}</small></div><button className="button button-primary button-compact" disabled={busy === row.id || new Date(row.ends_at) > new Date()} onClick={() => finalize(row.id)}><Trophy size={14} /> {busy === row.id ? 'Finalizing…' : 'Finalize results'}</button></article>)}</div>}
    </div>
    <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">PUBLISHED RESULTS</div><h2>Leaderboard snapshot</h2></div><select className="admin-filter-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Choose competition</option>{competitions.filter((row) => ['completed', 'archived'].includes(row.status)).map((row) => <option value={row.id} key={row.id}>{row.title}</option>)}</select></div>
      {leaderboard.length === 0 ? <p className="empty-copy">Select a finalized competition to inspect its read-only ranking.</p> : <div className="leaderboard-list">{leaderboard.map((row, index) => <article className={`leaderboard-row${row.is_winner ? ' leaderboard-winner' : ''}`} key={`${row.rank}-${index}`}><span className="leaderboard-rank">{row.rank}</span><strong>{row.student_name}</strong><span className="leaderboard-score">{Number(row.final_score).toFixed(2)}%</span>{row.is_winner && <span className="leaderboard-prize">ETB {Number(row.reward_amount_etb).toFixed(2)}</span>}</article>)}</div>}
    </div>
  </section>;
}
