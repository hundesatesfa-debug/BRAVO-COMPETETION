import { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

function stamp(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminAudit() {
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (filter) query = query.eq('entity_type', filter);
    const { data, error: loadError } = await query;
    if (loadError) setError(loadError.message);
    const items = data || []; setRows(items);
    const ids = [...new Set(items.map((row) => row.actor_id))];
    if (ids.length) {
      const { data: profileRows } = await supabase.from('profiles').select('id,full_name').in('id', ids);
      setProfiles(Object.fromEntries((profileRows || []).map((row) => [row.id, row.full_name])));
    } else setProfiles({});
    setLoading(false);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">SECURITY & GOVERNANCE</div><h1>Audit logs</h1></div><History size={20} /></div>
    {error && <Notice>{error}</Notice>}
    <div className="admin-filter-bar"><label className="field-label">Event type<select className="competition-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All events</option>{['competition', 'payment', 'refund', 'payout', 'student', 'settings', 'notification', 'examination', 'weekly_operation'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading audit trail…</div> : rows.length === 0 ? <div className="competition-empty"><History size={22} /><h3>No audit events</h3><p>Administrative changes and review decisions will be recorded here.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{stamp(row.created_at)}</td><td>{profiles[row.actor_id] || 'Administrator'}</td><td><strong>{row.action}</strong></td><td>{row.entity_type}<small>{row.entity_id || '—'}</small></td><td><code className="audit-json">{JSON.stringify(row.details)}</code></td></tr>)}</tbody></table></div>}
  </section>;
}
