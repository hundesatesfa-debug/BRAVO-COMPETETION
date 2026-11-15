
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const blankExam = {
  id: '',
  title: '',
  description: '',
  course_id: '',
  question_count: '10',
  seconds_per_question: '40',
  reconnect_grace_seconds: '180',
  allow_previous_navigation: true,
  question_ids: [],
};

const blankSchedule = {
  title: '',
  exam_library_id: '',
  access_mode: 'free',
  opens_at: '',
  closes_at: '',
};

const blankRound = {
  competition_id: '',
  exam_library_id: '',
  round_number: '1',
  title: '',
  opens_at: '',
  closes_at: '',
};

function toInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function academicLabel(value) {
  if (value == null) return 'All academic levels';
  return Number(value) === 1 ? 'Grade 12' : Number(value) === 2 ? 'Freshman' : `Level ${value}`;
}

function streamLabel(value) {
  if (value == null) return 'All streams';
  return Number(value) === 1
    ? 'Natural Science'
    : Number(value) === 2
      ? 'Social Science'
      : `Stream ${value}`;
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export default function AdminExaminations({ monitoring = false }) {
  const [activeTab, setActiveTab] = useState('library');

  const [library, setLibrary] = useState([]);
  const [courses, setCourses] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [rounds, setRounds] = useState([]);

  const [questions, setQuestions] = useState([]);
  const [examForm, setExamForm] = useState(blankExam);
  const [scheduleForm, setScheduleForm] = useState(blankSchedule);
  const [roundForm, setRoundForm] = useState(blankRound);

  const [sessions, setSessions] = useState([]);
  const [profiles, setProfiles] = useState({});

  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [returnToRound, setReturnToRound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    if (monitoring) {
      const [examResult, sessionResult] = await Promise.all([
        supabase
          .from('examinations')
          .select('*')
          .order('opens_at', { ascending: false }),

        supabase
          .from('examination_sessions')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(250),
      ]);

      if (examResult.error || sessionResult.error) {
        setError(
          getErrorMessage(examResult.error || sessionResult.error)
        );
      }

      const sessionRows = sessionResult.data || [];
      setSessions(sessionRows);

      const ids = [...new Set(sessionRows.map((row) => row.user_id))];

      if (ids.length) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);

        if (profileError) setError(getErrorMessage(profileError));

        setProfiles(
          Object.fromEntries(
            (data || []).map((row) => [row.id, row])
          )
        );
      } else {
        setProfiles({});
      }

      setLibrary(examResult.data || []);
      setLoading(false);
      return;
    }

    const [
      libraryResult,
      courseResult,
      competitionResult,
      scheduleResult,
      roundResult,
    ] = await Promise.all([
      supabase
        .from('exam_library')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('courses')
        .select('id, code, title, academic_level, stream')
        .eq('active', true)
        .order('title'),

      supabase
        .from('competitions')
        .select('id, title, competition_type, status')
        .order('starts_at', { ascending: false }),

      supabase
        .from('academic_exam_schedules')
        .select('*')
        .order('opens_at', { ascending: false }),

      supabase
        .from('competition_rounds')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    const failed =
      libraryResult.error ||
      courseResult.error ||
      competitionResult.error ||
      scheduleResult.error ||
      roundResult.error;

    if (failed) setError(getErrorMessage(failed));

    setLibrary(libraryResult.data || []);
    setCourses(courseResult.data || []);
    setCompetitions(competitionResult.data || []);
    setSchedules(scheduleResult.data || []);
    setRounds(roundResult.data || []);

    setLoading(false);
  }, [monitoring]);

  useEffect(() => {
    load();
  }, [load]);

  const publishedExams = useMemo(
    () => library.filter((exam) => exam.status === 'published'),
    [library]
  );

  const selectedCourse = courses.find(
    (course) => course.id === examForm.course_id
  );

  async function loadQuestions(courseId) {
    if (!courseId) {
      setQuestions([]);
      return;
    }

    setQuestionsLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('question_bank')
      .select(
        'id, prompt, choices, correct_choice_id, explanation, difficulty, topic_id, course_id'
      )
      .eq('course_id', courseId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(500);

    if (queryError) {
      setError(getErrorMessage(queryError));
      setQuestions([]);
    } else {
      setQuestions(data || []);
    }

    setQuestionsLoading(false);
  }

  function startNewExam() {
    setExamForm({ ...blankExam });
    setQuestions([]);
    setError('');
    setSuccess('');
  }

  async function editExam(exam) {
    setError('');
    setSuccess('');

    const { data, error: queryError } = await supabase
      .from('exam_library_questions')
      .select('question_id, position')
      .eq('exam_id', exam.id)
      .order('position');

    if (queryError) {
      setError(getErrorMessage(queryError));
      return;
    }

    const ids = (data || []).map((row) => row.question_id);

    setExamForm({
      id: exam.id,
      title: exam.title,
      description: exam.description || '',
      course_id: exam.course_id,
      question_count: String(exam.question_count),
      seconds_per_question: String(exam.seconds_per_question),
      reconnect_grace_seconds: String(exam.reconnect_grace_seconds),
      allow_previous_navigation: exam.allow_previous_navigation,
      question_ids: ids,
    });

    await loadQuestions(exam.course_id);
    setActiveTab('library');
  }

  function toggleQuestion(questionId) {
    setExamForm((current) => {
      const exists = current.question_ids.includes(questionId);

      if (exists) {
        return {
          ...current,
          question_ids: current.question_ids.filter((id) => id !== questionId),
        };
      }

      if (current.question_ids.length >= Number(current.question_count)) {
        setError(
          `You can select only ${current.question_count} questions for this exam.`
        );
        return current;
      }

      return {
        ...current,
        question_ids: [...current.question_ids, questionId],
      };
    });

    setError('');
  }

  async function saveExam(event) {
    event.preventDefault();

    setBusy('exam-save');
    setError('');
    setSuccess('');

    const count = Number(examForm.question_count);

    if (!examForm.course_id || !selectedCourse) {
      setError('Select a valid course.');
      setBusy('');
      return;
    }

    if (examForm.question_ids.length !== count) {
      setError(`Select exactly ${count} questions before saving.`);
      setBusy('');
      return;
    }

    const payload = {
      ...(examForm.id ? { id: examForm.id } : {}),
      title: examForm.title.trim(),
      description: examForm.description,
      course_id: examForm.course_id,
      question_count: count,
      seconds_per_question: Number(examForm.seconds_per_question),
      reconnect_grace_seconds: Number(examForm.reconnect_grace_seconds),
      allow_previous_navigation: examForm.allow_previous_navigation,
    };

    const { data, error: saveError } = await supabase.rpc(
      'admin_save_exam_library',
      {
        p_exam: payload,
        p_question_ids: examForm.question_ids,
      }
    );

    if (saveError) {
      setError(getErrorMessage(saveError));
      setBusy('');
      return;
    }

    setSuccess(
      examForm.id
        ? 'Exam draft updated successfully.'
        : 'Exam created successfully as a draft.'
    );

    setExamForm({ ...blankExam });
    setQuestions([]);

    await load();

    if (returnToRound) {
      setRoundForm((current) => ({
        ...current,
        exam_library_id: data,
      }));
      setReturnToRound(false);
      setActiveTab('rounds');
      setSuccess('New exam created. It has been selected for your competition round.');
    }

    setBusy('');
  }

  async function changeLibraryStatus(exam, status) {
    setBusy(exam.id);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('exam_library')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', exam.id)
      .eq('status', exam.status);

    if (updateError) {
      setError(getErrorMessage(updateError));
    } else {
      setSuccess(`${exam.title} is now ${status}.`);
      await load();
    }

    setBusy('');
  }

  async function saveSchedule(event) {
    event.preventDefault();

    setBusy('schedule-save');
    setError('');
    setSuccess('');

    const exam = publishedExams.find(
      (row) => row.id === scheduleForm.exam_library_id
    );

    if (!exam) {
      setError('Select a published exam.');
      setBusy('');
      return;
    }

    if (
      !scheduleForm.opens_at ||
      !scheduleForm.closes_at ||
      new Date(scheduleForm.closes_at) <= new Date(scheduleForm.opens_at)
    ) {
      setError('The closing time must be later than the opening time.');
      setBusy('');
      return;
    }

    const { error: insertError } = await supabase
      .from('academic_exam_schedules')
      .insert({
        exam_library_id: exam.id,
        title: scheduleForm.title.trim() || exam.title,
        access_mode: scheduleForm.access_mode,
        opens_at: toIso(scheduleForm.opens_at),
        closes_at: toIso(scheduleForm.closes_at),
        status: 'draft',
      });

    if (insertError) {
      setError(getErrorMessage(insertError));
    } else {
      setSuccess('Academic exam schedule created as a draft.');
      setScheduleForm({ ...blankSchedule });
      await load();
    }

    setBusy('');
  }

  async function saveRound(event) {
    event.preventDefault();

    setBusy('round-save');
    setError('');
    setSuccess('');

    const exam = publishedExams.find(
      (row) => row.id === roundForm.exam_library_id
    );

    const competition = competitions.find(
      (row) => row.id === roundForm.competition_id
    );

    if (!competition || !exam) {
      setError('Select a competition and a published exam.');
      setBusy('');
      return;
    }

    if (
      !roundForm.opens_at ||
      !roundForm.closes_at ||
      new Date(roundForm.closes_at) <= new Date(roundForm.opens_at)
    ) {
      setError('The closing time must be later than the opening time.');
      setBusy('');
      return;
    }

    const { error: insertError } = await supabase
      .from('competition_rounds')
      .insert({
        competition_id: competition.id,
        exam_library_id: exam.id,
        round_number: Number(roundForm.round_number),
        title: roundForm.title.trim(),
        opens_at: toIso(roundForm.opens_at),
        closes_at: toIso(roundForm.closes_at),
        status: 'draft',
      });

    if (insertError) {
      setError(getErrorMessage(insertError));
    } else {
      setSuccess('Competition round created as a draft.');
      setRoundForm({ ...blankRound });
      await load();
    }

    setBusy('');
  }

  async function updateScheduleStatus(row, status) {
    setBusy(row.id);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('academic_exam_schedules')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateError) {
      setError(getErrorMessage(updateError));
    } else {
      setSuccess(`${row.title} is now ${status}.`);
      await load();
    }

    setBusy('');
  }

  async function updateRoundStatus(row, status) {
    setBusy(row.id);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('competition_rounds')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateError) {
      setError(getErrorMessage(updateError));
    } else {
      setSuccess(`${row.title} is now ${status}.`);
      await load();
    }

    setBusy('');
  }

  function prepareNewRound() {
    setRoundForm({ ...blankRound });
    setError('');
    setSuccess('');
  }

  function createExamForRound() {
    setExamForm({ ...blankExam });
    setQuestions([]);
    setReturnToRound(true);
    setActiveTab('library');
    setError('');
    setSuccess('Create the exam below. It will be selected for your round after saving.');
  }

  function updateRoundCompetition(competitionId) {
    const existing = rounds
      .filter((row) => row.competition_id === competitionId)
      .map((row) => Number(row.round_number));

    const nextNumber = existing.length
      ? Math.max(...existing) + 1
      : 1;

    setRoundForm((current) => ({
      ...current,
      competition_id: competitionId,
      round_number: String(nextNumber),
    }));
  }

  if (monitoring) {
    return (
      <section className="admin-section">
        <div className="dashboard-section-heading">
          <div>
            <div className="eyebrow">LIVE REVIEW</div>
            <h1>Examination monitoring</h1>
          </div>

          <button
            type="button"
            className="button button-quiet button-compact"
            onClick={load}
          >
            <RefreshCw size={14} /> Refresh sessions
          </button>
        </div>

        {error && <Notice>{error}</Notice>}

        {loading ? (
          <div className="competition-empty">
            <span className="loading-inline" /> Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <div className="competition-empty">
            <CalendarClock size={22} />
            <h3>No examination sessions</h3>
            <p>Started and completed sessions will appear here.</p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Examination</th>
                  <th>Started</th>
                  <th>Timer / status</th>
                  <th>Review signals</th>
                  <th>Score</th>
                </tr>
              </thead>

              <tbody>
                {sessions.map((session) => {
                  const exam = library.find(
                    (row) => row.id === session.examination_id
                  );

                  return (
                    <tr key={session.id}>
                      <td>
                        <strong>
                          {profiles[session.user_id]?.full_name || 'Student'}
                        </strong>
                        <small>{session.user_id}</small>
                      </td>

                      <td>{exam?.title || 'Examination'}</td>

                      <td>{formatDate(session.started_at)}</td>

                      <td>
                        <span className={`status-pill status-${session.status}`}>
                          {session.status}
                        </span>
                        <small>Deadline {formatDate(session.deadline_at)}</small>
                      </td>

                      <td>
                        {session.interruption_count} signals
                        <small>{session.risk_flags?.join(', ') || 'None'}</small>
                      </td>

                      <td>
                        {session.score == null
                          ? '—'
                          : `${Number(session.score).toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="admin-section">
      <div className="dashboard-section-heading">
        <div>
          <div className="eyebrow">PHASE 4 · EXAMINATIONS</div>
          <h1>Examination management</h1>
          <p className="field-hint">
            Build reusable exams, schedule academic exams, and manage competition rounds.
          </p>
        </div>

        <button
          type="button"
          className="button button-quiet button-compact"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <div className="admin-row-actions" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`button ${activeTab === 'library' ? 'button-primary' : 'button-outline'}`}
          onClick={() => setActiveTab('library')}
        >
          <BookOpen size={15} /> Exam Library
        </button>

        <button
          type="button"
          className={`button ${activeTab === 'academic' ? 'button-primary' : 'button-outline'}`}
          onClick={() => setActiveTab('academic')}
        >
          <CalendarClock size={15} /> Academic Exams
        </button>

        <button
          type="button"
          className={`button ${activeTab === 'rounds' ? 'button-primary' : 'button-outline'}`}
          onClick={() => setActiveTab('rounds')}
        >
          <ShieldCheck size={15} /> Competition Rounds
        </button>
      </div>

      {loading ? (
        <div className="competition-empty">
          <span className="loading-inline" /> Loading examination data…
        </div>
      ) : (
        <>
          {activeTab === 'library' && (
            <>
              <form className="admin-panel admin-form" onSubmit={saveExam}>
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">
                      {examForm.id ? 'EDIT DRAFT' : 'EXAM BUILDER'}
                    </div>
                    <h2>{examForm.title || 'Create an exam'}</h2>
                  </div>

                  {(examForm.id || examForm.title) && (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={startNewExam}
                      aria-label="Clear exam form"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="admin-form-grid">
                  <label className="field-label">
                    Exam title
                    <input
                      className="competition-input"
                      required
                      minLength={3}
                      maxLength={140}
                      value={examForm.title}
                      onChange={(event) =>
                        setExamForm({ ...examForm, title: event.target.value })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Course
                    <select
                      className="competition-input"
                      required
                      value={examForm.course_id}
                      disabled={Boolean(examForm.id)}
                      onChange={async (event) => {
                        const courseId = event.target.value;

                        setExamForm({
                          ...examForm,
                          course_id: courseId,
                          question_ids: [],
                        });

                        await loadQuestions(courseId);
                      }}
                    >
                      <option value="">Select course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code} · {course.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label admin-span-2">
                    Description (optional)
                    <textarea
                      className="competition-input"
                      rows="2"
                      maxLength={2000}
                      value={examForm.description}
                      onChange={(event) =>
                        setExamForm({
                          ...examForm,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Number of questions
                    <input
                      className="competition-input"
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={examForm.question_count}
                      onChange={(event) =>
                        setExamForm({
                          ...examForm,
                          question_count: event.target.value,
                          question_ids: [],
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Seconds per question
                    <input
                      className="competition-input"
                      type="number"
                      min="30"
                      max="45"
                      required
                      value={examForm.seconds_per_question}
                      onChange={(event) =>
                        setExamForm({
                          ...examForm,
                          seconds_per_question: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Reconnect grace (seconds)
                    <input
                      className="competition-input"
                      type="number"
                      min="0"
                      max="900"
                      value={examForm.reconnect_grace_seconds}
                      onChange={(event) =>
                        setExamForm({
                          ...examForm,
                          reconnect_grace_seconds: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label checkbox-label">
                    <input
                      type="checkbox"
                      checked={examForm.allow_previous_navigation}
                      onChange={(event) =>
                        setExamForm({
                          ...examForm,
                          allow_previous_navigation: event.target.checked,
                        })
                      }
                    />
                    Allow previous-question navigation
                  </label>
                </div>

                <div className="admin-panel-title" style={{ marginTop: 24 }}>
                  <div>
                    <div className="eyebrow">
                      {examForm.question_ids.length} / {examForm.question_count} SELECTED
                    </div>
                    <h3>Select exam questions</h3>
                  </div>
                  <span className="field-hint">
                    Select exactly the required number.
                  </span>
                </div>

                {!examForm.course_id ? (
                  <p className="empty-copy">
                    Select a course to load its active Question Bank questions.
                  </p>
                ) : questionsLoading ? (
                  <p className="empty-copy">Loading course questions…</p>
                ) : questions.length === 0 ? (
                  <p className="empty-copy">
                    No active questions found for this course.
                  </p>
                ) : (
                  <div className="admin-question-list">
                    {questions.map((question, index) => {
                      const checked = examForm.question_ids.includes(question.id);

                      return (
                        <label
                          className="admin-question-row"
                          key={question.id}
                          style={{ cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleQuestion(question.id)}
                            disabled={
                              !checked &&
                              examForm.question_ids.length >=
                                Number(examForm.question_count)
                            }
                          />

                          <span style={{ flex: 1 }}>
                            <strong>
                              {index + 1}. {question.prompt}
                            </strong>
                            <small>
                              {question.difficulty || 'Standard'} ·{' '}
                              {Array.isArray(question.choices)
                                ? `${question.choices.length} choices`
                                : 'Multiple choice'}
                            </small>
                          </span>

                          {checked && <Check size={16} />}
                        </label>
                      );
                    })}
                  </div>
                )}

                <p className="field-hint">
                  Questions are copied into exam snapshots when saved. Later edits
                  to the Question Bank will not change an existing exam's saved questions.
                </p>

                <div className="admin-form-actions">
                  <button
                    className="button button-primary"
                    disabled={
                      busy === 'exam-save' ||
                      !examForm.course_id ||
                      examForm.question_ids.length !==
                        Number(examForm.question_count)
                    }
                  >
                    <Save size={15} />
                    {busy === 'exam-save'
                      ? 'Saving…'
                      : examForm.id
                        ? 'Save exam draft'
                        : 'Create exam draft'}
                  </button>
                </div>
              </form>

              <div className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">{library.length} EXAMS</div>
                    <h2>Exam Library</h2>
                  </div>
                  <button
                    type="button"
                    className="button button-outline button-compact"
                    onClick={startNewExam}
                  >
                    <Plus size={14} /> New exam
                  </button>
                </div>

                {library.length === 0 ? (
                  <p className="empty-copy">No exams have been created yet.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Exam</th>
                          <th>Course</th>
                          <th>Questions</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {library.map((exam) => {
                          const course = courses.find(
                            (row) => row.id === exam.course_id
                          );

                          return (
                            <tr key={exam.id}>
                              <td>
                                <strong>{exam.title}</strong>
                                <small>{exam.description || 'No description'}</small>
                              </td>

                              <td>
                                {course?.code || 'Course'}
                                <small>{course?.title || ''}</small>
                              </td>

                              <td>
                                {exam.question_count} × {exam.seconds_per_question}s
                              </td>

                              <td>
                                <span className={`status-pill status-${exam.status}`}>
                                  {exam.status}
                                </span>
                              </td>

                              <td>
                                <div className="admin-row-actions">
                                  {exam.status === 'draft' && (
                                    <>
                                      <button
                                        type="button"
                                        className="button button-quiet button-compact"
                                        onClick={() => editExam(exam)}
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        className="button button-primary button-compact"
                                        disabled={busy === exam.id}
                                        onClick={() =>
                                          changeLibraryStatus(exam, 'published')
                                        }
                                      >
                                        Publish
                                      </button>
                                    </>
                                  )}

                                  {exam.status === 'published' && (
                                    <button
                                      type="button"
                                      className="button button-outline button-compact"
                                      disabled={busy === exam.id}
                                      onClick={() =>
                                        changeLibraryStatus(exam, 'archived')
                                      }
                                    >
                                      <Archive size={13} /> Archive
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'academic' && (
            <>
              <form className="admin-panel admin-form" onSubmit={saveSchedule}>
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">INDEPENDENT SCHEDULING</div>
                    <h2>Schedule an academic exam</h2>
                  </div>
                  <CalendarClock size={19} />
                </div>

                <div className="admin-form-grid">
                  <label className="field-label admin-span-2">
                    Published exam
                    <select
                      className="competition-input"
                      required
                      value={scheduleForm.exam_library_id}
                      onChange={(event) =>
                        setScheduleForm({
                          ...scheduleForm,
                          exam_library_id: event.target.value,
                        })
                      }
                    >
                      <option value="">Select from Exam Library</option>
                      {publishedExams.map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label admin-span-2">
                    Schedule title (optional)
                    <input
                      className="competition-input"
                      maxLength={160}
                      value={scheduleForm.title}
                      placeholder="Uses the exam title if left blank"
                      onChange={(event) =>
                        setScheduleForm({
                          ...scheduleForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Access mode
                    <select
                      className="competition-input"
                      value={scheduleForm.access_mode}
                      onChange={(event) =>
                        setScheduleForm({
                          ...scheduleForm,
                          access_mode: event.target.value,
                        })
                      }
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                      <option value="reward">Reward</option>
                    </select>
                  </label>

                  <label className="field-label">
                    Opens at
                    <input
                      className="competition-input"
                      type="datetime-local"
                      required
                      value={scheduleForm.opens_at}
                      onChange={(event) =>
                        setScheduleForm({
                          ...scheduleForm,
                          opens_at: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Closes at
                    <input
                      className="competition-input"
                      type="datetime-local"
                      required
                      value={scheduleForm.closes_at}
                      onChange={(event) =>
                        setScheduleForm({
                          ...scheduleForm,
                          closes_at: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                {scheduleForm.exam_library_id && (() => {
                  const exam = publishedExams.find(
                    (row) => row.id === scheduleForm.exam_library_id
                  );
                  const course = courses.find(
                    (row) => row.id === exam?.course_id
                  );

                  return course ? (
                    <p className="field-hint">
                      This exam targets the course's academic assignment:
                      {' '}<strong>{academicLabel(course.academic_level)}</strong>
                      {' '}· <strong>{streamLabel(course.stream)}</strong>.
                    </p>
                  ) : null;
                })()}

                <div className="admin-form-actions">
                  <button
                    className="button button-primary"
                    disabled={busy === 'schedule-save' || !publishedExams.length}
                  >
                    <Save size={15} />
                    {busy === 'schedule-save'
                      ? 'Saving…'
                      : 'Create schedule draft'}
                  </button>
                </div>

                {!publishedExams.length && (
                  <p className="field-hint">
                    Publish an exam in the Exam Library before scheduling it.
                  </p>
                )}
              </form>

              <div className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">{schedules.length} SCHEDULES</div>
                    <h2>Academic exam schedules</h2>
                  </div>
                </div>

                {!schedules.length ? (
                  <p className="empty-copy">No academic exams scheduled yet.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Schedule</th>
                          <th>Access</th>
                          <th>Window</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {schedules.map((row) => {
                          const exam = library.find(
                            (item) => item.id === row.exam_library_id
                          );

                          const course = courses.find(
                            (item) => item.id === exam?.course_id
                          );

                          return (
                            <tr key={row.id}>
                              <td>
                                <strong>{row.title}</strong>
                                <small>
                                  {exam?.title || 'Exam'} ·{' '}
                                  {course?.code || 'Course'}
                                </small>
                                <small>
                                  {academicLabel(course?.academic_level)}
                                  {' · '}
                                  {streamLabel(course?.stream)}
                                </small>
                              </td>

                              <td>{row.access_mode}</td>

                              <td>
                                {formatDate(row.opens_at)}
                                <small>to {formatDate(row.closes_at)}</small>
                              </td>

                              <td>
                                <span className={`status-pill status-${row.status}`}>
                                  {row.status}
                                </span>
                              </td>

                              <td>
                                <div className="admin-row-actions">
                                  {row.status === 'draft' && (
                                    <button
                                      type="button"
                                      className="button button-primary button-compact"
                                      disabled={busy === row.id}
                                      onClick={() =>
                                        updateScheduleStatus(row, 'scheduled')
                                      }
                                    >
                                      Schedule
                                    </button>
                                  )}

                                  {row.status === 'scheduled' && (
                                    <>
                                      <button
                                        type="button"
                                        className="button button-primary button-compact"
                                        disabled={busy === row.id}
                                        onClick={() =>
                                          updateScheduleStatus(row, 'open')
                                        }
                                      >
                                        Open
                                      </button>

                                      <button
                                        type="button"
                                        className="button button-danger button-compact"
                                        disabled={busy === row.id}
                                        onClick={() =>
                                          updateScheduleStatus(row, 'cancelled')
                                        }
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}

                                  {row.status === 'open' && (
                                    <button
                                      type="button"
                                      className="button button-outline button-compact"
                                      disabled={busy === row.id}
                                      onClick={() =>
                                        updateScheduleStatus(row, 'closed')
                                      }
                                    >
                                      Close
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'rounds' && (
            <>
              <form className="admin-panel admin-form" onSubmit={saveRound}>
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">COMPETITION WORKFLOW</div>
                    <h2>Create a competition round</h2>
                  </div>
                  <ShieldCheck size={19} />
                </div>

                <div className="admin-form-grid">
                  <label className="field-label admin-span-2">
                    Competition
                    <select
                      className="competition-input"
                      required
                      value={roundForm.competition_id}
                      onChange={(event) =>
                        updateRoundCompetition(event.target.value)
                      }
                    >
                      <option value="">Select competition</option>
                      {competitions
                        .filter(
                          (row) =>
                            !['completed', 'cancelled', 'archived'].includes(
                              row.status
                            )
                        )
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.title} · {row.status}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="field-label">
                    Round number
                    <input
                      className="competition-input"
                      type="number"
                      min="1"
                      required
                      value={roundForm.round_number}
                      onChange={(event) =>
                        setRoundForm({
                          ...roundForm,
                          round_number: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Round title
                    <input
                      className="competition-input"
                      required
                      minLength={2}
                      maxLength={140}
                      value={roundForm.title}
                      onChange={(event) =>
                        setRoundForm({
                          ...roundForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label admin-span-2">
                    Exam from Exam Library
                    <select
                      className="competition-input"
                      required
                      value={roundForm.exam_library_id}
                      onChange={(event) =>
                        setRoundForm({
                          ...roundForm,
                          exam_library_id: event.target.value,
                        })
                      }
                    >
                      <option value="">Select published exam</option>
                      {publishedExams.map((exam) => (
                        <option key={exam.id} value={exam.id}>
                          {exam.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label">
                    Opens at
                    <input
                      className="competition-input"
                      type="datetime-local"
                      required
                      value={roundForm.opens_at}
                      onChange={(event) =>
                        setRoundForm({
                          ...roundForm,
                          opens_at: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field-label">
                    Closes at
                    <input
                      className="competition-input"
                      type="datetime-local"
                      required
                      value={roundForm.closes_at}
                      onChange={(event) =>
                        setRoundForm({
                          ...roundForm,
                          closes_at: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="admin-form-actions">
                  <button
                    type="submit"
                    className="button button-outline"
                    onClick={createExamForRound}
                    disabled={busy === 'round-save'}
                  >
                    <Plus size={14} /> Create a new exam instead
                  </button>

                  <button
                    className="button button-primary"
                    disabled={
                      busy === 'round-save' ||
                      !competitions.length ||
                      !publishedExams.length
                    }
                  >
                    <Save size={15} />
                    {busy === 'round-save' ? 'Saving…' : 'Create round draft'}
                  </button>
                </div>

                <p className="field-hint">
                  Each round has its own exam and schedule. You can select an
                  existing published exam or create a new exam first; it will
                  be selected here after it is saved and published.
                </p>
              </form>

              <div className="admin-panel">
                <div className="admin-panel-title">
                  <div>
                    <div className="eyebrow">{rounds.length} ROUNDS</div>
                    <h2>Competition rounds</h2>
                  </div>
                </div>

                {!rounds.length ? (
                  <p className="empty-copy">No competition rounds created yet.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Round</th>
                          <th>Competition</th>
                          <th>Exam</th>
                          <th>Window</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {rounds.map((row) => {
                          const competition = competitions.find(
                            (item) => item.id === row.competition_id
                          );

                          const exam = library.find(
                            (item) => item.id === row.exam_library_id
                          );

                          return (
                            <tr key={row.id}>
                              <td>
                                <strong>
                                  Round {row.round_number}: {row.title}
                                </strong>
                              </td>

                              <td>{competition?.title || 'Competition'}</td>

                              <td>{exam?.title || 'Exam'}</td>

                              <td>
                                {formatDate(row.opens_at)}
                                <small>to {formatDate(row.closes_at)}</small>
                              </td>

                              <td>
                                <span className={`status-pill status-${row.status}`}>
                                  {row.status}
                                </span>
                              </td>

                              <td>
                                <div className="admin-row-actions">
                                  {row.status === 'draft' && (
                                    <button
                                      type="button"
                                      className="button button-primary button-compact"
                                      disabled={busy === row.id}
                                      onClick={() =>
                                        updateRoundStatus(row, 'scheduled')
                                      }
                                    >
                                      Schedule
                                    </button>
                                  )}

                                  {row.status === 'scheduled' && (
                                    <>
                                      <button
                                        type="button"
                                        className="button button-primary button-compact"
                                        disabled={busy === row.id}
                                        onClick={() =>
                                          updateRoundStatus(row, 'open')
                                        }
                                      >
                                        Open
                                      </button>

                                      <button
                                        type="button"
                                        className="button button-danger button-compact"
                                        disabled={busy === row.id}
                                        onClick={() =>
                                          updateRoundStatus(row, 'cancelled')
                                        }
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}

                                  {row.status === 'open' && (
                                    <button
                                      type="button"
                                      className="button button-outline button-compact"
                                      disabled={busy === row.id}
                                      onClick={() =>
                                        updateRoundStatus(row, 'closed')
                                      }
                                    >
                                      Close
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
