import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Clock3, Edit3, Plus, UsersRound, X } from 'lucide-react';
import { Notice } from './UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const levelLabels = { grade_12: 'Grade 12', freshman: 'University Freshman' };
const streamLabels = { natural_science: 'Natural Science', social_science: 'Social Science' };

const emptyForm = {
  title: '', description: '', academicLevel: '', stream: '',
  registrationDeadline: '', startsAt: '', endsAt: '', status: 'draft',
};

function toDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function matchesStudent(event, profile) {
  return (!event.academic_level || event.academic_level === profile.academic_level)
    && (!event.stream || event.stream === profile.stream);
}

function registrationIsOpen(event) {
  const now = Date.now();
  return event.status === 'published'
    && new Date(event.registration_deadline).getTime() > now
    && new Date(event.starts_at).getTime() > now;
}

function getTargetLabel(event) {
  const level = event.academic_level ? levelLabels[event.academic_level] : 'All levels';
  const stream = event.stream ? streamLabels[event.stream] : 'All streams';
  return `${level} · ${stream}`;
}

async function loadAdminRegistrations() {
  const timestampedRows = await supabase.from('competition_registrations')
    .select('competition_id, user_id, created_at')
    .order('created_at', { ascending: false });
  if (timestampedRows.error?.message?.includes('created_at')) {
    return supabase.from('competition_registrations').select('competition_id, user_id');
  }
  return timestampedRows;
}

export default function CompetitionWorkspace() {
  const { account } = useAuth();
  const isAdmin = account?.role === 'admin';
  const [competitions, setCompetitions] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [participantsFor, setParticipantsFor] = useState('');

  async function loadWorkspace() {
    setLoading(true);
    setError('');
    try {
      const [{ data: competitionRows, error: competitionError }, registrationResult] = await Promise.all([
        supabase.from('competitions').select('*').order('starts_at', { ascending: true }),
        isAdmin
          ? loadAdminRegistrations()
          : supabase.from('competition_registrations').select('competition_id').eq('user_id', account.user.id),
      ]);
      if (competitionError) throw competitionError;
      if (registrationResult.error) throw registrationResult.error;

      setCompetitions(competitionRows || []);
      if (isAdmin) {
        const rows = registrationResult.data || [];
        setAllRegistrations(rows);
        setMyRegistrations([]);
        const userIds = [...new Set(rows.map((row) => row.user_id))];
        if (userIds.length) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles').select('id, full_name, academic_level, stream').in('id', userIds);
          if (profilesError) throw profilesError;
          setProfilesById(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile])));
        } else {
          setProfilesById({});
        }
      } else {
        setMyRegistrations(registrationResult.data || []);
        setAllRegistrations([]);
        setProfilesById({});
      }
    } catch (loadError) {
      setError(loadError.message || 'The competition workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, [isAdmin, account?.user.id]);

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNewCompetition() {
    setEditingId('');
    setForm(emptyForm);
    setFormOpen(true);
    setError('');
    setSuccess('');
  }

  function editCompetition(competition) {
    setEditingId(competition.id);
    setForm({
      title: competition.title,
      description: competition.description,
      academicLevel: competition.academic_level || '',
      stream: competition.stream || '',
      registrationDeadline: toDateTimeInput(competition.registration_deadline),
      startsAt: toDateTimeInput(competition.starts_at),
      endsAt: toDateTimeInput(competition.ends_at),
      status: competition.status,
    });
    setFormOpen(true);
    setError('');
    setSuccess('');
  }

  function cancelForm() {
    setFormOpen(false);
    setEditingId('');
    setForm(emptyForm);
    setError('');
  }

  async function saveCompetition(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const deadline = new Date(form.registrationDeadline);
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (deadline >= startsAt) {
      setError('The registration deadline must be before the competition starts.');
      return;
    }
    if (endsAt <= startsAt) {
      setError('The competition end time must be after its start time.');
      return;
    }

    setSaving(true);
    try {
      const values = {
        title: form.title.trim(),
        description: form.description.trim(),
        academic_level: form.academicLevel || null,
        stream: form.stream || null,
        registration_deadline: deadline.toISOString(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: form.status,
      };
      const result = editingId
        ? await supabase.from('competitions').update(values).eq('id', editingId)
        : await supabase.from('competitions').insert({ ...values, created_by: account.user.id });
      if (result.error) throw result.error;
      setSuccess(editingId ? 'Competition updated.' : 'Competition created.');
      setFormOpen(false);
      setEditingId('');
      setForm(emptyForm);
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError.message || 'The competition could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(competition) {
    const nextStatus = competition.status === 'published' ? 'closed' : 'published';
    setBusyId(competition.id);
    setError('');
    setSuccess('');
    try {
      const { error: updateError } = await supabase.from('competitions').update({ status: nextStatus }).eq('id', competition.id);
      if (updateError) throw updateError;
      setSuccess(nextStatus === 'published' ? 'Competition published for eligible students.' : 'Registration closed for this competition.');
      await loadWorkspace();
    } catch (updateError) {
      setError(updateError.message || 'The competition status could not be changed.');
    } finally {
      setBusyId('');
    }
  }

  async function register(competition) {
    setBusyId(competition.id);
    setError('');
    setSuccess('');
    try {
      const { error: insertError } = await supabase.from('competition_registrations').insert({ competition_id: competition.id });
      if (insertError) throw insertError;
      setSuccess(`You are registered for ${competition.title}.`);
      await loadWorkspace();
    } catch (registerError) {
      setError(registerError.message || 'Registration could not be completed.');
    } finally {
      setBusyId('');
    }
  }

  async function withdraw(competition) {
    setBusyId(competition.id);
    setError('');
    setSuccess('');
    try {
      const { error: deleteError } = await supabase.from('competition_registrations').delete()
        .eq('competition_id', competition.id).eq('user_id', account.user.id);
      if (deleteError) throw deleteError;
      setSuccess(`Your registration for ${competition.title} was withdrawn.`);
      await loadWorkspace();
    } catch (withdrawError) {
      setError(withdrawError.message || 'Your registration could not be withdrawn.');
    } finally {
      setBusyId('');
    }
  }

  const visibleCompetitions = isAdmin
    ? competitions
    : competitions.filter((competition) => matchesStudent(competition, account.profile));
  const registrationIds = new Set(myRegistrations.map((registration) => registration.competition_id));
  const publishedCount = competitions.filter((competition) => competition.status === 'published').length;
  const draftCount = competitions.filter((competition) => competition.status === 'draft').length;

  return <section className="competition-workspace" aria-labelledby="competition-workspace-title">
    <div className="competition-heading"><div><div className="eyebrow">{isAdmin ? 'ADMIN CONTROL CENTER' : 'YOUR ACADEMIC PATH'}</div><h2 id="competition-workspace-title">{isAdmin ? 'Competition management' : 'Competitions'}</h2><p>{isAdmin ? 'Create events, publish registration, and follow student sign-ups.' : 'Browse competitions matched to your level and stream.'}</p></div>{isAdmin && <button type="button" className="button button-primary" onClick={startNewCompetition}><Plus size={17} /> Create competition</button>}</div>

    {isAdmin && <div className="competition-stats"><div className="competition-stat"><span>Published</span><strong>{publishedCount}</strong></div><div className="competition-stat"><span>Drafts</span><strong>{draftCount}</strong></div><div className="competition-stat"><span>Student registrations</span><strong>{allRegistrations.length}</strong></div></div>}

    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}

    {isAdmin && formOpen && <form id="competition-form" className="competition-form" onSubmit={saveCompetition}>
      <div className="competition-form-heading"><div><div className="eyebrow">{editingId ? 'UPDATE EVENT' : 'NEW EVENT'}</div><h3>{editingId ? 'Edit competition' : 'Create a competition'}</h3></div><button type="button" className="icon-button" aria-label="Close competition form" onClick={cancelForm}><X size={18} /></button></div>
      <div className="competition-form-grid"><label className="field-label">Competition title<input className="competition-input" required minLength={3} maxLength={100} value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="e.g. National Science Challenge" /></label>
        <label className="field-label">Visibility<select className="competition-input" value={form.status} onChange={(event) => updateForm('status', event.target.value)}><option value="draft">Draft · admins only</option><option value="published">Published · students can register</option><option value="closed">Closed</option></select></label>
        <label className="field-label">Academic level<select className="competition-input" value={form.academicLevel} onChange={(event) => updateForm('academicLevel', event.target.value)}><option value="">All levels</option><option value="grade_12">Grade 12</option><option value="freshman">University Freshman</option></select></label>
        <label className="field-label">Stream<select className="competition-input" value={form.stream} onChange={(event) => updateForm('stream', event.target.value)}><option value="">All streams</option><option value="natural_science">Natural Science</option><option value="social_science">Social Science</option></select></label>
        <label className="field-label">Registration deadline<input className="competition-input" type="datetime-local" required value={form.registrationDeadline} onChange={(event) => updateForm('registrationDeadline', event.target.value)} /></label>
        <label className="field-label">Competition starts<input className="competition-input" type="datetime-local" required value={form.startsAt} onChange={(event) => updateForm('startsAt', event.target.value)} /></label>
        <label className="field-label">Competition ends<input className="competition-input" type="datetime-local" required value={form.endsAt} onChange={(event) => updateForm('endsAt', event.target.value)} /></label>
        <label className="field-label competition-description-field">Description<textarea className="competition-input" required minLength={1} maxLength={4000} rows={4} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Tell students what this competition covers and how it works." /></label>
      </div>
      <div className="competition-form-actions"><button type="button" className="button button-quiet" onClick={cancelForm}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : form.status === 'published' ? 'Publish competition' : 'Save draft'} <ArrowRight size={16} /></button></div>
    </form>}

    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading competitions…</div>
      : visibleCompetitions.length === 0 ? <div className="competition-empty"><span className="empty-icon"><CalendarDays size={21} /></span><h3>{isAdmin ? 'No competitions yet' : 'No open competitions yet'}</h3><p>{isAdmin ? 'Create a competition draft, then publish it when registration is ready.' : 'New competitions for your academic level and stream will appear here.'}</p>{isAdmin && <button type="button" className="button button-outline" onClick={startNewCompetition}><Plus size={16} /> Create your first competition</button>}</div>
      : <div className="competition-list">{visibleCompetitions.map((competition) => {
        const registrants = allRegistrations.filter((registration) => registration.competition_id === competition.id);
        const hasRegistered = registrationIds.has(competition.id);
        const canRegister = !isAdmin && registrationIsOpen(competition);
        const canWithdraw = hasRegistered && competition.status === 'published'
          && new Date(competition.registration_deadline).getTime() > Date.now();
        const statusLabel = competition.status === 'draft' ? 'Draft' : competition.status === 'closed' ? 'Closed' : registrationIsOpen(competition) ? 'Open for registration' : 'Registration closed';
        const showingParticipants = participantsFor === competition.id;
        return <article className="competition-card" key={competition.id}>
          <div className="competition-card-top"><span className={`competition-status status-${competition.status}`}>{statusLabel}</span><span className="competition-target">{getTargetLabel(competition)}</span></div>
          <h3>{competition.title}</h3><p className="competition-description">{competition.description}</p>
          <div className="competition-dates"><span><CalendarDays size={15} /> Starts {displayDate(competition.starts_at)}</span><span><Clock3 size={15} /> Register by {displayDate(competition.registration_deadline)}</span></div>
          <div className="competition-card-footer">{isAdmin ? <><span className="registration-count"><UsersRound size={15} /> {registrants.length} registered</span><div className="competition-actions"><button type="button" className="button button-quiet button-compact" onClick={() => setParticipantsFor(showingParticipants ? '' : competition.id)}><UsersRound size={14} /> {showingParticipants ? 'Hide students' : 'View students'}</button><button type="button" className="button button-quiet button-compact" onClick={() => editCompetition(competition)}><Edit3 size={14} /> Edit</button><button type="button" className="button button-compact button-primary" onClick={() => updateStatus(competition)} disabled={busyId === competition.id}>{busyId === competition.id ? 'Updating…' : competition.status === 'published' ? 'Close registration' : 'Publish'}</button></div></> : <><span className="registration-count">{hasRegistered ? <><Check size={15} /> You are registered</> : canRegister ? 'Ready to join?' : statusLabel}</span><button type="button" className={`button ${hasRegistered ? 'button-quiet' : 'button-primary'} button-compact`} onClick={() => hasRegistered ? withdraw(competition) : register(competition)} disabled={busyId === competition.id || (hasRegistered ? !canWithdraw : !canRegister)}>{busyId === competition.id ? 'Please wait…' : hasRegistered ? canWithdraw ? 'Withdraw' : 'Registered' : 'Register'} {!hasRegistered && <ArrowRight size={15} />}</button></>}</div>
          {isAdmin && showingParticipants && <div className="participant-list"><h4>Registered students</h4>{registrants.length === 0 ? <p>No students have registered for this event yet.</p> : registrants.map((registration) => {
            const profile = profilesById[registration.user_id];
            return <div className="participant-row" key={registration.user_id}><span className="participant-avatar">{(profile?.full_name || 'S').charAt(0).toUpperCase()}</span><span className="participant-name"><strong>{profile?.full_name || 'Student'}</strong><small>{levelLabels[profile?.academic_level] || 'Level unavailable'} · {streamLabels[profile?.stream] || 'Stream unavailable'}</small></span>{registration.created_at && <time>{displayDate(registration.created_at)}</time>}</div>;
          })}</div>}
        </article>;
      })}</div>}
  </section>;
}
