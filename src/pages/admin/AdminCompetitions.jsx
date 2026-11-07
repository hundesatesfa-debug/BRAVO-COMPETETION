import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, Save, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const empty = {
  id: '', title: '', description: '', competition_type: 'weekly_arena', academic_level: '', stream: '',
  registration_opens_at: '', registration_deadline: '', starts_at: '', ends_at: '', minimum_participants: '1',
};
const statusNames = { draft: 'Draft', registration_open: 'Registration open', registration_closed: 'Registration closed', active: 'In progress', completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived' };

function toInput(value) { if (!value) return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function toIso(value) { return value ? new Date(value).toISOString() : ''; }
function showDate(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminCompetitions() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('competitions').select('*').order('starts_at', { ascending: false });
    if (loadError) setError(loadError.message);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function set(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function edit(row) {
    setForm({ id: row.id, title: row.title, description: row.description, competition_type: row.competition_type,
      academic_level: row.academic_level || '', stream: row.stream || '', registration_opens_at: toInput(row.registration_opens_at),
      registration_deadline: toInput(row.registration_deadline), starts_at: toInput(row.starts_at), ends_at: toInput(row.ends_at),
      minimum_participants: String(row.minimum_participants || 1) });
    setEditing(true); setError(''); setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() { setForm(empty); setEditing(false); }

  async function save(event) {
    event.preventDefault(); setBusy('save'); setError(''); setSuccess('');
    const payload = { ...form, registration_opens_at: toIso(form.registration_opens_at), registration_deadline: toIso(form.registration_deadline), starts_at: toIso(form.starts_at), ends_at: toIso(form.ends_at), minimum_participants: Number(form.minimum_participants) };
    const { error: saveError } = await supabase.rpc('admin_save_competition', { p_competition: payload });
    if (saveError) setError(saveError.message);
    else { setSuccess(editing ? 'Competition details updated.' : 'Competition draft created.'); reset(); await load(); }
    setBusy('');
  }

  async function changeStatus(row, status) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: statusError } = await supabase.rpc('admin_set_competition_status', { p_competition_id: row.id, p_status: status });
    if (statusError) setError(statusError.message);
    else { setSuccess(`Competition status changed to ${statusNames[status]}.`); await load(); }
    setBusy('');
  }

  const title = form.competition_type === 'weekly_arena' ? 'Weekly Micro-Arena' : 'Grand Milestone Competition';
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">PHASE 3 · COMPETITIONS</div><h1>Competition management</h1></div><button className="button button-primary button-compact" onClick={() => { reset(); setEditing(false); }}><Plus size={15} /> New competition</button></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <form className="admin-panel admin-form" onSubmit={save}>
      <div className="admin-panel-title"><div><div className="eyebrow">{editing ? 'EDIT DRAFT' : 'CREATE DRAFT'}</div><h2>{editing ? form.title : 'Competition details'}</h2></div>{editing && <button className="icon-button" type="button" onClick={reset} aria-label="Cancel editing"><X size={16} /></button>}</div>
      <div className="admin-form-grid">
        <label className="field-label">Competition type<select className="competition-input" value={form.competition_type} onChange={(event) => set('competition_type', event.target.value)} disabled={editing}>
          <option value="weekly_arena">Weekly Micro-Arena · ETB 10 · max 100</option><option value="grand_milestone">Grand Milestone · ETB 100 · unlimited</option>
        </select></label>
        <label className="field-label">Title<input className="competition-input" required minLength={3} maxLength={100} value={form.title} onChange={(event) => set('title', event.target.value)} /></label>
        <label className="field-label admin-span-2">Description<textarea className="competition-input" required minLength={1} maxLength={4000} value={form.description} onChange={(event) => set('description', event.target.value)} /></label>
        <label className="field-label">Academic level<select className="competition-input" value={form.academic_level} onChange={(event) => set('academic_level', event.target.value)}><option value="">All levels</option><option value="grade_12">Grade 12</option><option value="freshman">University Freshman</option></select></label>
        <label className="field-label">Academic stream<select className="competition-input" value={form.stream} onChange={(event) => set('stream', event.target.value)}><option value="">All streams</option><option value="natural_science">Natural Science</option><option value="social_science">Social Science</option></select></label>
        <label className="field-label">Registration opens<input className="competition-input" type="datetime-local" required value={form.registration_opens_at} onChange={(event) => set('registration_opens_at', event.target.value)} /></label>
        <label className="field-label">Registration deadline<input className="competition-input" type="datetime-local" required value={form.registration_deadline} onChange={(event) => set('registration_deadline', event.target.value)} /></label>
        <label className="field-label">Competition starts<input className="competition-input" type="datetime-local" required value={form.starts_at} onChange={(event) => set('starts_at', event.target.value)} /></label>
        <label className="field-label">Competition ends<input className="competition-input" type="datetime-local" required value={form.ends_at} onChange={(event) => set('ends_at', event.target.value)} /></label>
        <label className="field-label">Minimum verified participants<input className="competition-input" type="number" min="1" max={form.competition_type === 'weekly_arena' ? '100' : undefined} required value={form.minimum_participants} onChange={(event) => set('minimum_participants', event.target.value)} /></label>
      </div>
      <p className="field-hint">The server fixes entry fees and revenue split by competition type. Weekly Arena has 100 seats, ETB 10 entry, and a 75/25 reward/platform split. Grand Competition has no cap, ETB 100 entry, and a 50/50 split.</p>
      <div className="admin-form-actions"><button className="button button-primary" type="submit" disabled={busy === 'save'}><Save size={15} /> {busy === 'save' ? 'Saving…' : editing ? 'Save draft' : `Create ${title} draft`}</button></div>
    </form>

    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading competitions…</div> : rows.length === 0 ? <div className="competition-empty"><CalendarDays size={22} /><h3>No competitions yet</h3><p>Create a draft, configure its dates, then open registration when payment instructions are ready.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Competition</th><th>Type / entry</th><th>Registration</th><th>Starts</th><th>Status</th><th>Manage</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><strong>{row.title}</strong><small>{row.minimum_participants} minimum participants</small></td>
      <td>{row.competition_type === 'weekly_arena' ? 'Weekly Arena' : 'Grand Competition'}<small>ETB {Number(row.entry_fee_etb).toFixed(0)} · {row.participant_limit || 'Unlimited'} places</small></td>
      <td>{showDate(row.registration_deadline)}</td><td>{showDate(row.starts_at)}</td>
      <td><span className={`status-pill status-${row.status}`}>{statusNames[row.status] || row.status}</span></td>
      <td><div className="admin-row-actions">
        {!['completed', 'cancelled', 'archived'].includes(row.status) && <button className="button button-quiet button-compact" disabled={busy === row.id || row.status !== 'draft'} onClick={() => edit(row)}>Edit</button>}
        {row.status === 'draft' && <button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => changeStatus(row, 'registration_open')}>{busy === row.id ? 'Saving…' : 'Open registration'}</button>}
        {row.status === 'registration_open' && <button className="button button-outline button-compact" disabled={busy === row.id} onClick={() => changeStatus(row, 'registration_closed')}>Close registration</button>}
        {row.status === 'registration_closed' && new Date(row.starts_at) <= new Date() && <button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => changeStatus(row, 'active')}>Activate</button>}
        {['draft', 'registration_open', 'registration_closed', 'active'].includes(row.status) && <button className="button button-danger button-compact" disabled={busy === row.id} onClick={() => changeStatus(row, 'cancelled')}>Cancel</button>}
        {row.status === 'completed' && <button className="button button-quiet button-compact" disabled={busy === row.id} onClick={() => changeStatus(row, 'archived')}>Archive</button>}
      </div></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
