import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('notifications').select('*').eq('user_id', account.user.id).order('created_at', { ascending: false }).limit(100);
    if (loadError) setError(loadError.message);
    setItems(data || []);
    setLoading(false);
  }, [account.user.id]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    setBusy(true); setError('');
    const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (updateError) setError(updateError.message);
    else setItems((rows) => rows.map((row) => row.id === id ? { ...row, read_at: new Date().toISOString() } : row));
    setBusy(false);
  }

  async function markAllRead() {
    setBusy(true); setError('');
    const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', account.user.id).is('read_at', null);
    if (updateError) setError(updateError.message);
    else await load();
    setBusy(false);
  }

  const unreadCount = items.filter((item) => !item.read_at).length;
  return <section className="operational-page" aria-labelledby="notifications-title">
    <div className="dashboard-section-heading"><div><div className="eyebrow">UPDATES</div><h1 id="notifications-title">Notifications</h1></div>
      {unreadCount > 0 && <button type="button" className="button button-quiet button-compact" onClick={markAllRead} disabled={busy}><CheckCheck size={15} /> Mark all read</button>}
    </div>
    {error && <Notice>{error}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading notifications…</div> : items.length === 0 ? (
      <div className="competition-empty"><Bell size={22} /><h3>You’re all caught up</h3><p>Payment updates, examination notices, and results will appear here.</p></div>
    ) : <div className="notification-list">{items.map((item) => <article className={`notification-row${item.read_at ? '' : ' notification-unread'}`} key={item.id}>
      <div className="notification-icon"><Bell size={16} /></div><div className="notification-copy"><div className="notification-title-row"><strong>{item.title}</strong><span>{item.category}</span></div><p>{item.body}</p><time>{formatDate(item.created_at)}</time></div>
      {!item.read_at && <button type="button" className="icon-button" onClick={() => markRead(item.id)} disabled={busy} aria-label="Mark notification read"><Check size={16} /></button>}
    </article>)}</div>}
  </section>;
}
