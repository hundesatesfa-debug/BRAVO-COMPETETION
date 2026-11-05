
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  Plus,
  UsersRound,
  X,
} from 'lucide-react';
import { Notice } from './UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const levelLabels = {
  1: 'Grade 12',
  2: 'University Freshman',
};

const streamLabels = {
  1: 'Natural Science',
  2: 'Social Science',
};

const emptyForm = {
  title: '',
  description: '',
  academicLevel: '',
  stream: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  startsAt: '',
  endsAt: '',
  status: 'draft',
};

function toDateTimeInput(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 16);
}

function displayDate(value) {
  if (!value) return 'Not set';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not set';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function matchesStudent(competition, profile) {
  if (!profile) return false;

  const levelMatches =
    competition.academic_level_id == null ||
    Number(competition.academic_level_id) ===
      Number(profile.academic_level_id);

  const streamMatches =
    competition.stream_id == null ||
    Number(competition.stream_id) ===
      Number(profile.stream_id);

  return levelMatches && streamMatches;
}

function getTargetLabel(competition) {
  const level = competition.academic_level_id
    ? levelLabels[competition.academic_level_id] || 'Unknown level'
    : 'All levels';

  const stream = competition.stream_id
    ? streamLabels[competition.stream_id] || 'Unknown stream'
    : 'All streams';

  return `${level} · ${stream}`;
}

function getStatusLabel(competition) {
  if (competition.status === 'draft') return 'Draft';
  if (competition.status === 'closed') return 'Closed';
  if (competition.status === 'completed') return 'Completed';
  if (competition.status === 'cancelled') return 'Cancelled';

  const now = Date.now();
  const opensAt = new Date(competition.registration_open_at).getTime();
  const closesAt = new Date(competition.registration_close_at).getTime();

  if (now < opensAt) return 'Details published';
  if (now > closesAt) return 'Registration closed';

  return 'Details published';
}

async function loadAdminRegistrations() {
  return supabase
    .from('competition_registrations')
    .select('competition_id, student_id, registered_at')
    .order('registered_at', { ascending: false });
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
      const [
        { data: competitionRows, error: competitionError },
        registrationResult,
      ] = await Promise.all([
        supabase
          .from('competitions')
          .select('*')
          .order('starts_at', { ascending: true }),

        isAdmin
          ? loadAdminRegistrations()
          : supabase
              .from('competition_registrations')
              .select('competition_id')
              .eq('student_id', account.user.id),
      ]);

      if (competitionError) throw competitionError;
      if (registrationResult.error) throw registrationResult.error;

      setCompetitions(competitionRows || []);

      if (isAdmin) {
        const rows = registrationResult.data || [];

        setAllRegistrations(rows);
        setMyRegistrations([]);

        const userIds = [
          ...new Set(rows.map((row) => row.student_id)),
        ];

        if (userIds.length) {
          const { data: profiles, error: profilesError } =
            await supabase
              .from('profiles')
              .select(
                'id, full_name, academic_level_id, stream_id'
              )
              .in('id', userIds);

          if (profilesError) throw profilesError;

          setProfilesById(
            Object.fromEntries(
              (profiles || []).map((profile) => [
                profile.id,
                profile,
              ])
            )
          );
        } else {
          setProfilesById({});
        }
      } else {
        setMyRegistrations(registrationResult.data || []);
        setAllRegistrations([]);
        setProfilesById({});
      }
    } catch (loadError) {
      setError(
        loadError.message ||
          'The competition workspace could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (account?.user?.id) {
      loadWorkspace();
    }
  }, [isAdmin, account?.user?.id]);

  function updateForm(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
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
      title: competition.title || '',
      description: competition.description || '',
      academicLevel:
        competition.academic_level_id?.toString() || '',
      stream: competition.stream_id?.toString() || '',
      registrationOpensAt: toDateTimeInput(
        competition.registration_open_at
      ),
      registrationClosesAt: toDateTimeInput(
        competition.registration_close_at
      ),
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

    const opensAt = new Date(form.registrationOpensAt);
    const closesAt = new Date(form.registrationClosesAt);
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);

    if (
      !form.registrationOpensAt ||
      !form.registrationClosesAt ||
      !form.startsAt ||
      !form.endsAt ||
      [opensAt, closesAt, startsAt, endsAt].some(
        (date) => Number.isNaN(date.getTime())
      )
    ) {
      setError('Please provide all competition dates.');
      return;
    }

    if (opensAt >= closesAt) {
      setError(
        'Registration opening time must be before its closing time.'
      );
      return;
    }

    if (closesAt >= startsAt) {
      setError(
        'Registration must close before the competition starts.'
      );
      return;
    }

    if (endsAt <= startsAt) {
      setError(
        'The competition end time must be after its start time.'
      );
      return;
    }

    setSaving(true);

    try {
      const values = {
        title: form.title.trim(),
        description: form.description.trim(),
        academic_level_id: form.academicLevel
          ? Number(form.academicLevel)
          : null,
        stream_id: form.stream
          ? Number(form.stream)
          : null,
        registration_open_at: opensAt.toISOString(),
        registration_close_at: closesAt.toISOString(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: form.status,
      };

      const result = editingId
        ? await supabase
            .from('competitions')
            .update(values)
            .eq('id', editingId)
        : await supabase
            .from('competitions')
            .insert({
              ...values,
              created_by: account.user.id,
            });

      if (result.error) throw result.error;

      setSuccess(
        editingId
          ? 'Competition updated.'
          : 'Competition created.'
      );

      setFormOpen(false);
      setEditingId('');
      setForm(emptyForm);

      await loadWorkspace();
    } catch (saveError) {
      setError(
        saveError.message ||
          'The competition could not be saved.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(competition) {
    const nextStatus =
      competition.status === 'open' ? 'closed' : 'open';

    setBusyId(competition.id);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('competitions')
        .update({ status: nextStatus })
        .eq('id', competition.id);

      if (updateError) throw updateError;

      setSuccess(
        nextStatus === 'open'
          ? 'Competition details published.'
          : 'Competition details closed.'
      );

      await loadWorkspace();
    } catch (updateError) {
      setError(
        updateError.message ||
          'The competition status could not be changed.'
      );
    } finally {
      setBusyId('');
    }
  }

  const visibleCompetitions = isAdmin
    ? competitions
    : competitions.filter(
        (competition) =>
          competition.status !== 'draft' &&
          matchesStudent(competition, account?.profile)
      );

  const registrationIds = new Set(
    myRegistrations.map(
      (registration) => registration.competition_id
    )
  );

  const publishedCount = competitions.filter(
    (competition) => competition.status === 'open'
  ).length;

  const draftCount = competitions.filter(
    (competition) => competition.status === 'draft'
  ).length;

  return (
    <section
      className="competition-workspace"
      aria-labelledby="competition-workspace-title"
    >
      <div className="competition-heading">
        <div>
          <div className="eyebrow">
            {isAdmin ? 'ADMIN CONTROL CENTER' : 'YOUR ACADEMIC PATH'}
          </div>

          <h2 id="competition-workspace-title">
            {isAdmin ? 'Competition management' : 'Competitions'}
          </h2>

          <p>
            {isAdmin
              ? 'Manage competition details. Student registration opens after payment verification is ready.'
              : 'Browse competition details matched to your academic profile. Paid registration is not open yet.'}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            className="button button-primary"
            onClick={startNewCompetition}
          >
            <Plus size={17} /> Create competition
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="competition-stats">
          <div className="competition-stat">
            <span>Published</span>
            <strong>{publishedCount}</strong>
          </div>

          <div className="competition-stat">
            <span>Drafts</span>
            <strong>{draftCount}</strong>
          </div>

          <div className="competition-stat">
            <span>Stored registration records</span>
            <strong>{allRegistrations.length}</strong>
          </div>
        </div>
      )}

      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      {isAdmin && formOpen && (
        <form
          id="competition-form"
          className="competition-form"
          onSubmit={saveCompetition}
        >
          <div className="competition-form-heading">
            <div>
              <div className="eyebrow">
                {editingId ? 'UPDATE EVENT' : 'NEW EVENT'}
              </div>
              <h3>
                {editingId
                  ? 'Edit competition'
                  : 'Create a competition'}
              </h3>
            </div>

            <button
              type="button"
              className="icon-button"
              aria-label="Close competition form"
              onClick={cancelForm}
            >
              <X size={18} />
            </button>
          </div>

          <div className="competition-form-grid">
            <label className="field-label">
              Competition title
              <input
                className="competition-input"
                required
                minLength={3}
                maxLength={100}
                value={form.title}
                onChange={(event) =>
                  updateForm('title', event.target.value)
                }
                placeholder="e.g. National Science Challenge"
              />
            </label>

            <label className="field-label">
              Visibility
              <select
                className="competition-input"
                value={form.status}
                onChange={(event) =>
                  updateForm('status', event.target.value)
                }
              >
                <option value="draft">Draft · admins only</option>
                <option value="open">
                  Open · details visible
                </option>
                <option value="closed">Closed</option>
              </select>
            </label>

            <label className="field-label">
              Academic level
              <select
                className="competition-input"
                value={form.academicLevel}
                onChange={(event) =>
                  updateForm('academicLevel', event.target.value)
                }
              >
                <option value="">All levels</option>
                <option value="1">Grade 12</option>
                <option value="2">University Freshman</option>
              </select>
            </label>

            <label className="field-label">
              Stream
              <select
                className="competition-input"
                value={form.stream}
                onChange={(event) =>
                  updateForm('stream', event.target.value)
                }
              >
                <option value="">All streams</option>
                <option value="1">Natural Science</option>
                <option value="2">Social Science</option>
              </select>
            </label>

            <label className="field-label">
              Registration opens
              <input
                className="competition-input"
                type="datetime-local"
                required
                value={form.registrationOpensAt}
                onChange={(event) =>
                  updateForm(
                    'registrationOpensAt',
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field-label">
              Registration closes
              <input
                className="competition-input"
                type="datetime-local"
                required
                value={form.registrationClosesAt}
                onChange={(event) =>
                  updateForm(
                    'registrationClosesAt',
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field-label">
              Competition starts
              <input
                className="competition-input"
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(event) =>
                  updateForm('startsAt', event.target.value)
                }
              />
            </label>

            <label className="field-label">
              Competition ends
              <input
                className="competition-input"
                type="datetime-local"
                required
                value={form.endsAt}
                onChange={(event) =>
                  updateForm('endsAt', event.target.value)
                }
              />
            </label>

            <label className="field-label competition-description-field">
              Description
              <textarea
                className="competition-input"
                required
                minLength={1}
                maxLength={4000}
                rows={4}
                value={form.description}
                onChange={(event) =>
                  updateForm('description', event.target.value)
                }
                placeholder="Tell students what this competition covers and how it works."
              />
            </label>
          </div>

          <div className="competition-form-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={cancelForm}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : form.status === 'open'
                    ? 'Publish competition'
                    : 'Save draft'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="competition-empty">
          <span className="loading-inline" /> Loading competitions…
        </div>
      ) : visibleCompetitions.length === 0 ? (
        <div className="competition-empty">
          <span className="empty-icon">
            <CalendarDays size={21} />
          </span>

          <h3>
            {isAdmin
              ? 'No competitions yet'
              : 'No competition details yet'}
          </h3>

          <p>
            {isAdmin
              ? 'Create a competition draft, then publish its details when they are ready.'
              : 'Published competition details for your academic profile will appear here.'}
          </p>

          {isAdmin && (
            <button
              type="button"
              className="button button-outline"
              onClick={startNewCompetition}
            >
              <Plus size={16} /> Create your first competition
            </button>
          )}
        </div>
      ) : (
        <div className="competition-list">
          {visibleCompetitions.map((competition) => {
            const registrants = allRegistrations.filter(
              (registration) =>
                registration.competition_id === competition.id
            );

            const hasRegistered = registrationIds.has(
              competition.id
            );

            const statusLabel = getStatusLabel(competition);
            const showingParticipants =
              participantsFor === competition.id;

            return (
              <article
                className="competition-card"
                key={competition.id}
              >
                <div className="competition-card-top">
                  <span
                    className={`competition-status status-${competition.status}`}
                  >
                    {statusLabel}
                  </span>

                  <span className="competition-target">
                    {getTargetLabel(competition)}
                  </span>
                </div>

                <h3>{competition.title}</h3>

                <p className="competition-description">
                  {competition.description}
                </p>

                <div className="competition-dates">
                  <span>
                    <CalendarDays size={15} />
                    Starts {displayDate(competition.starts_at)}
                  </span>

                  <span>
                    <Clock3 size={15} />
                    Register by{' '}
                    {displayDate(competition.registration_close_at)}
                  </span>
                </div>

                <div className="competition-card-footer">
                  {isAdmin ? (
                    <>
                      <span className="registration-count">
                        <UsersRound size={15} />
                        {registrants.length} stored sign-ups
                      </span>

                      <div className="competition-actions">
                        <button
                          type="button"
                          className="button button-quiet button-compact"
                          onClick={() =>
                            setParticipantsFor(
                              showingParticipants ? '' : competition.id
                            )
                          }
                        >
                          <UsersRound size={14} />
                          {showingParticipants
                            ? 'Hide students'
                            : 'View stored records'}
                        </button>

                        <button
                          type="button"
                          className="button button-quiet button-compact"
                          onClick={() => editCompetition(competition)}
                        >
                          <Edit3 size={14} /> Edit
                        </button>

                        <button
                          type="button"
                          className="button button-compact button-primary"
                          onClick={() => updateStatus(competition)}
                          disabled={
                            busyId === competition.id ||
                            competition.status === 'completed' ||
                            competition.status === 'cancelled'
                          }
                        >
                          {busyId === competition.id
                            ? 'Updating…'
                            : competition.status === 'open'
                              ? 'Close'
                              : 'Publish details'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="registration-count">
                      {hasRegistered ? (
                        <>
                          <Check size={15} />
                          A past sign-up record exists; payment eligibility is unverified.
                        </>
                      ) : (
                        'Paid registration will open after payment verification is available.'
                      )}
                    </span>
                  )}
                </div>

                {isAdmin && showingParticipants && (
                  <div className="participant-list">
                    <h4>Registered students</h4>

                    {registrants.length === 0 ? (
                      <p>
                        No students have registered for this event yet.
                      </p>
                    ) : (
                      registrants.map((registration) => {
                        const profile =
                          profilesById[registration.student_id];

                        return (
                          <div
                            className="participant-row"
                            key={registration.student_id}
                          >
                            <span className="participant-avatar">
                              {(profile?.full_name || 'S')
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <span className="participant-name">
                              <strong>
                                {profile?.full_name || 'Student'}
                              </strong>

                              <small>
                                {levelLabels[
                                  profile?.academic_level_id
                                ] || 'Level unavailable'}
                                {' · '}
                                {streamLabels[
                                  profile?.stream_id
                                ] || 'Stream unavailable'}
                              </small>
                            </span>

                            {registration.registered_at && (
                              <time>
                                {displayDate(
                                  registration.registered_at
                                )}
                              </time>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
