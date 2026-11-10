import { useCallback, useEffect, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

function formatRegistrationDate(value) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
    : '—';
}

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let query = supabase.from('profiles').select('id, full_name, phone, university, department, academic_level_id, stream_id, created_at, school_name').order('created_at', { ascending: false }).limit(300);
    if (search.trim()) query = query.ilike('full_name', `%${search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
    const [
      { data, error: profileError },
      { data: roleData, error: roleError },
      { data: levelData, error: levelError },
      { data: streamData, error: streamError },
    ] = await Promise.all([
      query,
      supabase.from('user_roles').select('user_id').eq('role', 'student'),
      supabase.from('academic_levels').select('id, name'),
      supabase.from('streams').select('id, name'),
    ]);
    if (profileError || roleError || levelError || streamError) {
      setError(profileError?.message || roleError?.message || levelError?.message || streamError?.message || 'Student records could not be loaded.');
    }
    const studentIds = new Set((roleData || []).map((row) => row.user_id));
    const levelNames = new Map((levelData || []).map((row) => [String(row.id), row.name]));
    const streamNames = new Map((streamData || []).map((row) => [String(row.id), row.name]));
    setStudents((data || [])
      .filter((row) => studentIds.has(row.id))
      .map((student) => ({
        ...student,
        academic_level_name: levelNames.get(String(student.academic_level_id)) || '',
        stream_name: streamNames.get(String(student.stream_id)) || '',
      })));
    setLoading(false);
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(load, 200); return () => window.clearTimeout(timer); }, [load]);

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">USER MANAGEMENT</div><h1>Students</h1></div><span className="section-note">{students.length} loaded</span></div>
    {error && <Notice>{error}</Notice>}
    <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name" /></label>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading student accounts…</div> : students.length === 0 ? <div className="competition-empty"><UserRound size={22} /><h3>No matching students</h3></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Student</th><th>Academic level</th><th>Stream</th><th>Phone</th><th>University</th><th>Department</th><th>School</th><th>Registered</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}>
      <td><strong>{student.full_name}</strong><small>{student.id}</small></td>
      <td>{student.academic_level_name || student.academic_level_id || '—'}</td>
      <td>{student.stream_name || student.stream_id || '—'}</td>
      <td>{student.phone || '—'}</td>
      <td>{student.university || '—'}</td>
      <td>{student.department || '—'}</td>
      <td>{student.school_name || '—'}</td>
      <td>{formatRegistrationDate(student.created_at)}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}
