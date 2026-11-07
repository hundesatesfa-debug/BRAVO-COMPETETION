import { useCallback, useEffect, useState } from 'react';
import { Download, PieChart } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

function money(value) { return `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function downloadCsv(rows) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = rows.map((row) => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bravo-financial-report.csv'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminReports() {
  const [report, setReport] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const fromValue = from ? new Date(`${from}T00:00:00`).toISOString() : null;
    const toValue = to ? new Date(`${to}T00:00:00`).toISOString() : null;
    const { data, error: rpcError } = await supabase.rpc('admin_financial_report', { p_from: fromValue, p_to: toValue });
    if (rpcError) setError(rpcError.message); else setReport(data);
    setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  function exportReport() {
    const rows = [['Competition', 'Type', 'Verified entries ETB', 'Reward pool ETB', 'Platform allocation ETB', 'Paid out ETB', 'Refunds ETB']];
    for (const row of report?.by_competition || []) rows.push([row.title, row.competition_type, row.verified_entries_etb, row.reward_pool_etb, row.platform_allocation_etb, row.paid_out_etb, row.refunds_etb]);
    downloadCsv(rows);
  }

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">FINANCIAL CONTROL</div><h1>Financial reports</h1></div><button className="button button-outline button-compact" onClick={exportReport} disabled={!report?.by_competition?.length}><Download size={15} /> Export CSV</button></div>
    {error && <Notice>{error}</Notice>}
    <div className="admin-panel admin-filter-bar"><label className="field-label">From<input className="competition-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field-label">To (exclusive)<input className="competition-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button-quiet button-compact" onClick={load}>Refresh</button></div>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Calculating ledger totals…</div> : report && <>
      <div className="admin-metric-grid admin-finance-metrics">{[
        ['Verified entry revenue', report.verified_entry_revenue_etb], ['Paid payouts', report.paid_payouts_etb], ['Paid refunds', report.paid_refunds_etb],
        ['Outstanding prizes', report.outstanding_payouts_etb], ['Refunds to process', report.pending_refunds_etb],
      ].map(([label, amount]) => <article className="admin-metric-card" key={label}><span>{label}</span><strong>{money(amount)}</strong></article>)}</div>
      <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">SEPARATE LEDGERS</div><h2>By competition</h2></div><PieChart size={18} /></div>
        {(report.by_competition || []).length === 0 ? <p className="empty-copy">No competition records fall in this period.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Competition</th><th>Verified entry revenue</th><th>Reward pool</th><th>Platform share</th><th>Paid out</th><th>Refunded</th></tr></thead><tbody>{report.by_competition.map((row) => <tr key={row.competition_id}><td><strong>{row.title}</strong><small>{row.competition_type === 'weekly_arena' ? 'Weekly Arena' : 'Grand Competition'}</small></td><td>{money(row.verified_entries_etb)}</td><td>{money(row.reward_pool_etb)}</td><td>{money(row.platform_allocation_etb)}</td><td>{money(row.paid_out_etb)}</td><td>{money(row.refunds_etb)}</td></tr>)}</tbody></table></div>}
      </div>
    </>}
  </section>;
}
