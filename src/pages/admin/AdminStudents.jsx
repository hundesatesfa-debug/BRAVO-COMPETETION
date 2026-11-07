import { useCallback, useEffect, useState } from 'react';
import { Search, Shield, UserRound } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [suspendingId, setSuspendingId] = useState('');
  const [suspensionNote, setSuspensionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let query = supabase.from('profiles').select('id, full_name, phone_number, academic_level, stream, account_status, account_status_note, created_at').order('created_at', { ascending: false }).limit(300);
    if (search.trim()) query = query.ilike('full_name', `%${search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
    const [{ data, error: profileError }, { data: roleData, error: roleError }] = await Promise.all([
      query,
      supabase.from('user_roles').select('user_id').eq('role', 'student'),
    ]);
    if (profileError || roleError) setError(profileError?.message || roleError?.message || 'Student records could not be loaded.');
    const studentIds = new Set((roleData || []).map((row) => row.user_id));
    setStudents((data || []).filter((row) => studentIds.has(row.id)));
    setLoading(false);
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(load, 200); return () => window.clearTimeout(timer); }, [load]);

  async function updateStatus(student, status, note = '') {
    setBusy(student.id); setError(''); setSuccess('');
    const { error: updateError } = await supabase.rpc('admin_set_student_status', { p_student_id: student.id, p_status: status, p_note: note });
    if (updateError) setError(updateError.message);
    else { setSuccess(`${student.full_name} is now ${status}.`); await load(); }
    setBusy('');
  }

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">USER MANAGEMENT</div><h1>Students</h1></div><span className="section-note">{students.length} loaded</span></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name" /></label>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading student accounts…</div> : students.length === 0 ? <div className="competition-empty"><UserRound size={22} /><h3>No matching students</h3></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Student</th><th>Academic profile</th><th>Contact</th><th>Status</th><th>Access</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}>
      <td><strong>{student.full_name}</strong><small>{student.id}</small></td>
      <td>{student.academic_level || 'Not set'}<small>{student.stream || 'No stream'}</small></td>
      <td>{student.phone_number || '—'}</td>
      <td><span className={`status-pill status-${student.account_status}`}>{student.account_status}</span>{student.account_status_note && <small>{student.account_status_note}</small>}</td>
      <td>{student.account_status === 'active' ? suspendingId === student.id ? <form className="admin-suspend-form" onSubmit={(event) => { event.preventDefault(); updateStatus(student, 'suspended', suspensionNote); }}>
        <input className="competition-input" value={suspensionNote} maxLength={300} onChange={(event) => setSuspensionNote(event.target.value)} aria-label={`Suspension reason for ${student.full_name}`} placeholder="Reason or support note (optional)" />
        <button className="button button-danger button-compact" type="submit" disabled={busy === student.id}><Shield size={14} /> Confirm</button>
        <button className="button button-quiet button-compact" type="button" onClick={() => { setSuspendingId(''); setSuspensionNote(''); }}>Cancel</button>
      </form> : <button className="button button-danger button-compact" disabled={busy === student.id} onClick={() => { setSuspendingId(student.id); setSuspensionNote(''); }}><Shield size={14} /> Suspend</button> : <button className="button button-primary button-compact" disabled={busy === student.id} onClick={() => updateStatus(student, 'active')}>Reactivate</button>}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}
