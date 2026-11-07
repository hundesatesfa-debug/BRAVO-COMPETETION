import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Save, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const blank = { id: '', competition_id: '', course_id: '', exam_type: 'weekly_arena', week_number: '1', title: '', question_count: '10', seconds_per_question: '40', opens_at: '', closes_at: '', reconnect_grace_seconds: '180', allow_previous_navigation: true };
function toInput(value) { if (!value) return ''; const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function iso(value) { return value ? new Date(value).toISOString() : ''; }
function date(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminExaminations({ monitoring = false }) {
  const [exams, setExams] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [examResult, competitionResult, courseResult] = await Promise.all([
      supabase.from('examinations').select('*').order('opens_at', { ascending: false }),
      supabase.from('competitions').select('id, title, competition_type, status').order('starts_at', { ascending: false }),
      supabase.from('courses').select('id, code, title').eq('active', true).order('title'),
    ]);
    const failed = examResult.error || competitionResult.error || courseResult.error;
    if (failed) setError(failed.message);
    setExams(examResult.data || []); setCompetitions(competitionResult.data || []); setCourses(courseResult.data || []);
    if (monitoring) {
      const { data, error: sessionError } = await supabase.from('examination_sessions').select('*').order('started_at', { ascending: false }).limit(250);
      if (sessionError) setError(sessionError.message);
      setSessions(data || []);
      const ids = [...new Set((data || []).map((row) => row.user_id))];
      if (ids.length) {
        const { data: profileRows } = await supabase.from('profiles').select('id, full_name, academic_level, stream').in('id', ids);
        setProfiles(Object.fromEntries((profileRows || []).map((row) => [row.id, row])));
      } else setProfiles({});
    }
    setLoading(false);
  }, [monitoring]);
  useEffect(() => { load(); }, [load]);

  function reset() { setForm(blank); }
  function edit(row) {
    setForm({ id: row.id, competition_id: row.competition_id, course_id: row.course_id, exam_type: row.exam_type,
      week_number: String(row.week_number || 1), title: row.title, question_count: String(row.question_count),
      seconds_per_question: String(row.seconds_per_question), opens_at: toInput(row.opens_at), closes_at: toInput(row.closes_at),
      reconnect_grace_seconds: String(row.reconnect_grace_seconds), allow_previous_navigation: row.allow_previous_navigation });
  }

  async function save(event) {
    event.preventDefault(); setBusy('save'); setError(''); setSuccess('');
    const payload = { ...form, question_count: Number(form.question_count), seconds_per_question: Number(form.seconds_per_question),
      week_number: form.exam_type === 'grand_weekly' ? Number(form.week_number) : null,
      reconnect_grace_seconds: Number(form.reconnect_grace_seconds), opens_at: iso(form.opens_at), closes_at: iso(form.closes_at) };
    const { error: saveError } = await supabase.rpc('admin_save_examination', { p_exam: payload });
    if (saveError) setError(saveError.message); else { setSuccess('Examination saved as a draft.'); reset(); await load(); }
    setBusy('');
  }

  async function setStatus(row, status) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: rpcError } = await supabase.rpc('admin_set_exam_status', { p_exam_id: row.id, p_status: status });
    if (rpcError) setError(rpcError.message); else { setSuccess(`${row.title} is now ${status}.`); await load(); }
    setBusy('');
  }

  if (monitoring) return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">LIVE REVIEW</div><h1>Examination monitoring</h1></div><button className="button button-quiet button-compact" onClick={load}>Refresh sessions</button></div>
    {error && <Notice>{error}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading sessions…</div> : sessions.length === 0 ? <div className="competition-empty"><CalendarClock size={22} /><h3>No examination sessions</h3><p>Started and completed sessions will appear here.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Student</th><th>Examination</th><th>Started</th><th>Timer / status</th><th>Review signals</th><th>Score</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}>
      <td><strong>{profiles[session.user_id]?.full_name || 'Student'}</strong><small>{session.user_id}</small></td>
      <td>{exams.find((row) => row.id === session.examination_id)?.title || 'Examination'}<small>{exams.find((row) => row.id === session.examination_id)?.exam_type || ''}</small></td>
      <td>{date(session.started_at)}</td><td><span className={`status-pill status-${session.status}`}>{session.status}</span><small>Deadline {date(session.deadline_at)}</small></td>
      <td>{session.interruption_count} signals<small>{session.risk_flags?.join(', ') || 'None'}</small></td><td>{session.score == null ? '—' : `${Number(session.score).toFixed(2)}%`}</td>
    </tr>)}</tbody></table></div>}
  </section>;

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">PHASE 4 · EXAMINATIONS</div><h1>Exam scheduling</h1></div></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <form className="admin-panel admin-form" onSubmit={save}><div className="admin-panel-title"><div><div className="eyebrow">{form.id ? 'EDIT DRAFT' : 'NEW EXAM'}</div><h2>{form.title || 'Schedule an examination'}</h2></div>{form.id && <button className="icon-button" type="button" onClick={reset}><X size={16} /></button>}</div>
      <div className="admin-form-grid">
        <label className="field-label">Competition<select className="competition-input" required value={form.competition_id} onChange={(event) => { const selected = competitions.find((row) => row.id === event.target.value); setForm({ ...form, competition_id: event.target.value, exam_type: selected?.competition_type === 'grand_milestone' ? 'grand_final' : 'weekly_arena' }); }}><option value="">Select competition</option>{competitions.filter((row) => !['completed', 'cancelled', 'archived'].includes(row.status)).map((row) => <option key={row.id} value={row.id}>{row.title} · {row.competition_type === 'weekly_arena' ? 'Weekly Arena' : 'Grand'}</option>)}</select></label>
        <label className="field-label">Course<select className="competition-input" required value={form.course_id} onChange={(event) => setForm({ ...form, course_id: event.target.value })}><option value="">Select course</option>{courses.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.title}</option>)}</select></label>
        <label className="field-label">Exam type<select className="competition-input" value={form.exam_type} onChange={(event) => setForm({ ...form, exam_type: event.target.value })}><option value="weekly_arena">Weekly Arena exam</option><option value="grand_weekly">Grand Competition weekly exam</option><option value="grand_final">Grand Competition final</option></select></label>
        {form.exam_type === 'grand_weekly' && <label className="field-label">Competition week<input className="competition-input" type="number" min="1" max="8" required value={form.week_number} onChange={(event) => setForm({ ...form, week_number: event.target.value })} /></label>}
        <label className="field-label">Exam title<input className="competition-input" required minLength={3} maxLength={140} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="field-label">Number of questions<input className="competition-input" type="number" min="1" max="100" required value={form.question_count} onChange={(event) => setForm({ ...form, question_count: event.target.value })} /></label>
        <label className="field-label">Seconds per question<input className="competition-input" type="number" min="30" max="45" required value={form.seconds_per_question} onChange={(event) => setForm({ ...form, seconds_per_question: event.target.value })} /></label>
        <label className="field-label">Opens at<input className="competition-input" type="datetime-local" required value={form.opens_at} onChange={(event) => setForm({ ...form, opens_at: event.target.value })} /></label>
        <label className="field-label">Closes at<input className="competition-input" type="datetime-local" required value={form.closes_at} onChange={(event) => setForm({ ...form, closes_at: event.target.value })} /></label>
        <label className="field-label">Reconnect grace (seconds)<input className="competition-input" type="number" min="0" max="900" value={form.reconnect_grace_seconds} onChange={(event) => setForm({ ...form, reconnect_grace_seconds: event.target.value })} /></label>
        <label className="field-label checkbox-label"><input type="checkbox" checked={form.allow_previous_navigation} onChange={(event) => setForm({ ...form, allow_previous_navigation: event.target.checked })} /> Allow previous question navigation</label>
      </div>
      <p className="field-hint">Exam duration is calculated by the server from the question count and per-question time. Student answers and scores are saved and calculated on the server.</p>
      <div className="admin-form-actions"><button className="button button-primary" disabled={busy === 'save' || !courses.length || !competitions.length}><Save size={15} /> {busy === 'save' ? 'Saving…' : 'Save examination draft'}</button></div>
    </form>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading exams…</div> : exams.length === 0 ? <div className="competition-empty"><CalendarClock size={22} /><h3>No examinations scheduled</h3><p>Create courses and questions first, then schedule an exam.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Examination</th><th>Competition</th><th>Window</th><th>Questions</th><th>Status</th><th>Workflow</th></tr></thead><tbody>{exams.map((row) => <tr key={row.id}>
      <td><strong>{row.title}</strong><small>{row.exam_type.replaceAll('_', ' ')}{row.week_number ? ` · week ${row.week_number}` : ''}</small></td>
      <td>{competitions.find((comp) => comp.id === row.competition_id)?.title || 'Competition'}<small>{courses.find((course) => course.id === row.course_id)?.code || 'Course'}</small></td>
      <td>{date(row.opens_at)}<small>to {date(row.closes_at)}</small></td><td>{row.question_count} × {row.seconds_per_question}s</td>
      <td><span className={`status-pill status-${row.status}`}>{row.status}</span></td>
      <td><div className="admin-row-actions">{row.status === 'draft' && <><button className="button button-quiet button-compact" onClick={() => edit(row)}>Edit</button><button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => setStatus(row, 'scheduled')}>Schedule</button></>}{row.status === 'scheduled' && new Date(row.opens_at) <= new Date() && new Date(row.closes_at) > new Date() && <button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => setStatus(row, 'open')}>Open now</button>}{['scheduled', 'open'].includes(row.status) && <button className="button button-outline button-compact" disabled={busy === row.id} onClick={() => setStatus(row, 'closed')}>Close</button>}{['draft', 'scheduled'].includes(row.status) && <button className="button button-danger button-compact" disabled={busy === row.id} onClick={() => setStatus(row, 'cancelled')}>Cancel</button>}</div></td>
    </tr>)}</tbody></table></div>}
  </section>;
}
