import { useCallback, useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

export default function AdminNotifications() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ user_id: '', title: '', body: '', category: 'announcement' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, account_status').eq('account_status', 'active').order('full_name'),
      supabase.from('user_roles').select('user_id').eq('role', 'student'),
    ]);
    if (profileError || roleError) setError(profileError?.message || roleError?.message);
    const studentIds = new Set((roles || []).map((row) => row.user_id));
    setStudents((profiles || []).filter((row) => studentIds.has(row.id))); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    const { data, error: sendError } = await supabase.rpc('admin_send_notification', {
      p_user_id: form.user_id || null, p_title: form.title, p_body: form.body, p_category: form.category,
    });
    if (sendError) setError(sendError.message); else { setSuccess(`Notification sent to ${data} student${data === 1 ? '' : 's'}.`); setForm({ user_id: '', title: '', body: '', category: 'announcement' }); }
    setBusy(false);
  }

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">STUDENT COMMUNICATION</div><h1>Notifications</h1></div><BellRing size={20} /></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading student list…</div> : <form className="admin-panel admin-form" onSubmit={send}>
      <div className="admin-panel-title"><div><div className="eyebrow">IN-APP MESSAGE</div><h2>Send an update</h2></div></div>
      <div className="admin-form-grid">
        <label className="field-label">Recipient<select className="competition-input" value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })}><option value="">All active students</option>{students.map((student) => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select></label>
        <label className="field-label">Category<select className="competition-input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="announcement">Announcement</option><option value="competition">Competition</option><option value="system">System</option></select></label>
        <label className="field-label admin-span-2">Title<input className="competition-input" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="field-label admin-span-2">Message<textarea className="competition-input" required maxLength={1000} rows="4" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
      </div>
      <button className="button button-primary" disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Send notification'}</button>
    </form>}
  </section>;
}
