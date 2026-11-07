import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BookOpenCheck, CircleDollarSign, CreditCard, GraduationCap, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const cards = [
  ['total_students', 'Registered students', Users],
  ['active_students', 'Active accounts', GraduationCap],
  ['weekly_participants', 'Weekly Arena entries', Trophy],
  ['grand_participants', 'Grand Competition entries', BookOpenCheck],
  ['pending_payments', 'Payments to review', CreditCard],
  ['verified_payments', 'Verified payments', CircleDollarSign],
];

function money(value) { return `ETB ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

export default function AdminOverview() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_dashboard_metrics');
    setError(rpcError?.message || ''); setMetrics(data); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="competition-empty"><span className="loading-inline" /> Loading administration metrics…</div>;
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">ADMINISTRATION</div><h1>Operations overview</h1></div><button className="button button-quiet button-compact" onClick={load}><ArrowUpRight size={15} /> Refresh</button></div>
    {error && <Notice>{error}</Notice>}
    <div className="admin-metric-grid">{cards.map(([key, label, Icon]) => <article className="admin-metric-card" key={key}><span className="panel-icon cyan-icon"><Icon size={17} /></span><span>{label}</span><strong>{Number(metrics?.[key] || 0).toLocaleString()}</strong></article>)}</div>
    <div className="admin-finance-strip"><div><span>Verified entry revenue</span><strong>{money(metrics?.gross_verified_revenue_etb)}</strong></div><div><span>Unsettled prize liability</span><strong>{money(metrics?.reward_liabilities_etb)}</strong></div><div><span>Payouts waiting</span><strong>{Number(metrics?.pending_payouts || 0)}</strong></div></div>
    <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">RECENT ADMIN ACTIVITY</div><h2>Audit trail</h2></div><Link to="/admin/audit" className="text-link">View all</Link></div>
      {!metrics?.recent_activity?.length ? <p className="empty-copy">No administrative activity recorded yet.</p> : <div className="admin-activity-list">{metrics.recent_activity.map((item) => <div className="admin-activity-row" key={item.id}><span className="admin-activity-dot" /><div><strong>{item.action.replaceAll('.', ' ')}</strong><small>{item.entity_type} · {item.actor_name || 'Administrator'}</small></div><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time></div>)}</div>}
    </div>
  </section>;
}
