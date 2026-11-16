
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Play,
  Send,
} from 'lucide-react';
import { Notice } from '../components/UI.jsx';
import { supabase } from '../lib/supabase.js';

function formatDate(value) {
  if (!value) return 'Not specified';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function countdown(value, now) {
  const seconds = Math.max(
    0,
    Math.ceil((new Date(value).getTime() - now) / 1000),
  );

  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60,
  ).padStart(2, '0')}`;
}

export default function ExamPage() {
  const [exams, setExams] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [session, setSession] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(1);
  const [remaining, setRemaining] = useState('00:00');
  const [clockNow, setClockNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const autoSubmitted = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data, error: loadError } = await supabase.rpc(
      'get_student_academic_exam_feed',
    );

    if (loadError) {
      setError(loadError.message);
      setExams([]);
    } else {
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.exams)
          ? data.exams
          : [];

      setExams(rows);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openSession(exam, start = false) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      let sessionId = exam.session_id;

      if (start) {
        const { data, error: startError } = await supabase.rpc(
          'start_academic_exam',
          {
            p_schedule_id: exam.schedule_id,
          },
        );

        if (startError) throw startError;

        sessionId = data?.session_id;
      }

      if (!sessionId) {
        throw new Error('The examination session could not be found.');
      }

      const { data: sessionData, error: sessionError } =
        await supabase.rpc('get_academic_exam_session', {
          p_session_id: sessionId,
        });

      if (sessionError) throw sessionError;

      if (!sessionData) {
        throw new Error('The examination session could not be loaded.');
      }

      setActiveExam(exam);
      setSession(sessionData);
      setCurrentPosition(1);

      const serverStart = Date.parse(sessionData.started_at);
      const offset = Number.isFinite(serverStart)
        ? serverStart - Date.now()
        : 0;

      setClockOffset(offset);
      setClockNow(Date.now() + offset);
      autoSubmitted.current = '';
    } catch (err) {
      setError(err.message || 'Could not open the examination.');
    } finally {
      setBusy(false);
    }
  }

  async function saveChoice(position, choiceId) {
    if (!session || session.status !== 'in_progress' || busy) return;

    setBusy(true);
    setError('');

    try {
      const { error: answerError } = await supabase.rpc(
        'save_academic_exam_answer',
        {
          p_session_id: session.session_id,
          p_position: position,
          p_selected_choice_id: choiceId,
        },
      );

      if (answerError) throw answerError;

      setSession((old) => ({
        ...old,
        questions: old.questions.map((question) =>
          question.position === position
            ? { ...question, selected_choice_id: choiceId }
            : question,
        ),
      }));
    } catch (err) {
      setError(err.message || 'Your answer could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const submit = useCallback(async (automatic = false) => {
    if (
      !session ||
      session.status !== 'in_progress' ||
      busy ||
      autoSubmitted.current === session.session_id
    ) {
      return;
    }

    if (automatic) {
      autoSubmitted.current = session.session_id;
    }

    setBusy(true);
    setError('');

    try {
      const { data, error: submitError } = await supabase.rpc(
        'submit_academic_exam',
        {
          p_session_id: session.session_id,
        },
      );

      if (submitError) throw submitError;

      setSession((old) => ({
        ...old,
        ...data,
        session_id: old.session_id,
        status: data.status || 'submitted',
      }));

      setNotice(
        automatic
          ? 'The examination deadline was reached. Your saved answers were submitted.'
          : 'Your answers were submitted and scored by the server.',
      );

      await load();
    } catch (err) {
      if (automatic) autoSubmitted.current = '';

      setError(err.message || 'The examination could not be submitted.');
    } finally {
      setBusy(false);
    }
  }, [session, busy, load]);

  useEffect(() => {
    if (!session || session.status !== 'in_progress') {
      return undefined;
    }

    const tick = () => {
      const now = Date.now() + clockOffset;
      setClockNow(now);

      const deadline = Date.parse(session.deadline_at);

      if (!Number.isFinite(deadline)) return;

      setRemaining(countdown(deadline, now));

      if (
        now >= deadline &&
        autoSubmitted.current !== session.session_id
      ) {
        submit(true);
      }
    };

    tick();

    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, [session, clockOffset, submit]);

  const question = session?.questions?.find(
    (item) => item.position === currentPosition,
  );

  const finished =
    session?.status === 'submitted' || session?.status === 'expired';

  const deadlineReached =
    session?.deadline_at &&
    clockNow >= Date.parse(session.deadline_at);

  const focusMode = Boolean(activeExam && session);

  return (
    <section
      className={`operational-page ${focusMode ? 'exam-focus-mode' : ''}`}
      aria-label={focusMode ? 'Examination workspace' : 'Examinations'}
    >
      {!focusMode && (
        <div className="dashboard-section-heading">
          <div>
            <div className="eyebrow">ACADEMIC ASSESSMENTS</div>
            <h1 id="exams-title">Examinations</h1>
          </div>
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      {notice && finished && (
        <Notice tone="success">{notice}</Notice>
      )}

      {activeExam && session ? (
        <article className="exam-panel exam-focus-shell">
          {finished ? (
            <div className="exam-result-card">
              <CheckCircle2 size={30} />

              <div>
                <span>
                  {session.status === 'expired' ? 'Time ended' : 'Submitted'}
                </span>

                <strong>
                  {Number(session.score || 0).toFixed(2)}%
                </strong>

                <small>
                  {session.correct_count ?? 0} correct out of{' '}
                  {session.total_questions}
                </small>
              </div>

              <button
                className="button button-primary"
                onClick={() => {
                  setActiveExam(null);
                  setSession(null);
                  setNotice('');
                  setError('');
                  load();
                }}
              >
                Back to examinations
              </button>
            </div>
          ) : (
            <>
              <header className="exam-focus-header">
                <div className="exam-focus-counter">
                  QUESTION {String(currentPosition).padStart(2, '0')}
                  <span>/ {String(session.total_questions).padStart(2, '0')}</span>
                </div>

                {session.status === 'in_progress' && (
                  <div
                    className={`exam-timer exam-focus-timer${
                      remaining === '00:00' ? ' exam-timer-ended' : ''
                    }`}
                    aria-label={`Time remaining ${remaining}`}
                  >
                    <Clock3 size={17} />
                    <strong>{remaining}</strong>
                  </div>
                )}
              </header>

              <div
                className="exam-progress-track exam-focus-progress"
                role="progressbar"
                aria-valuenow={currentPosition}
                aria-valuemin={1}
                aria-valuemax={session.total_questions}
              >
                <span
                  style={{
                    width: `${
                      (currentPosition / session.total_questions) * 100
                    }%`,
                  }}
                />
              </div>

              {question && (
                <div className="exam-question exam-focus-question">
                  <h2>{question.prompt}</h2>

                  <div className="exam-choice-list">
                    {(question.choices || []).map((choice) => {
                      const selected =
                        question.selected_choice_id === choice.id;

                      return (
                        <button
                          key={choice.id}
                          type="button"
                          className={`exam-choice exam-focus-choice${
                            selected ? ' selected' : ''
                          }`}
                          onClick={() =>
                            saveChoice(question.position, choice.id)
                          }
                          disabled={
                            busy ||
                            session.status !== 'in_progress' ||
                            deadlineReached
                          }
                          aria-pressed={selected}
                        >
                          <span className="exam-choice-letter">
                            {String(choice.id).toUpperCase()}
                          </span>

                          <span className="exam-choice-text">
                            {choice.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <footer className="exam-controls exam-focus-controls">
                <button
                  className="exam-nav-button exam-previous-button"
                  onClick={() =>
                    setCurrentPosition((value) => Math.max(1, value - 1))
                  }
                  disabled={currentPosition <= 1 || busy}
                >
                  <ArrowLeft size={17} />
                  Previous
                </button>

                {currentPosition < session.total_questions ? (
                  <button
                    className="exam-nav-button exam-next-button"
                    onClick={() =>
                      setCurrentPosition((value) =>
                        Math.min(session.total_questions, value + 1),
                      )
                    }
                    disabled={busy}
                  >
                    Next
                    <ArrowRight size={17} />
                  </button>
                ) : (
                  <button
                    className="exam-nav-button exam-submit-button"
                    onClick={() => submit(false)}
                    disabled={busy}
                  >
                    <Send size={16} />
                    {busy ? 'Submitting…' : 'Submit examination'}
                  </button>
                )}
              </footer>
            </>
          )}
        </article>
      ) : loading ? (
        <div className="competition-empty">
          <span className="loading-inline" />
          Loading your examination schedule…
        </div>
      ) : exams.length === 0 ? (
        <div className="competition-empty">
          <Clock3 size={22} />
          <h3>No examinations available</h3>
          <p>
            There are currently no published examinations open for your
            academic level and stream.
          </p>
        </div>
      ) : (
        <div className="operational-list">
          {exams.map((exam) => {
            const canStart = !exam.session_id;
            const canResume =
              exam.session_id && exam.session_status === 'in_progress';

            const complete =
              exam.session_status === 'submitted' ||
              exam.session_status === 'expired';

            return (
              <article className="operational-card" key={exam.schedule_id}>
                <div className="operational-card-main">
                  <div className="panel-icon cyan-icon">
                    <Play size={17} />
                  </div>

                  <div>
                    <span className="eyebrow">
                      {exam.course_title || 'Academic examination'}
                    </span>

                    <h2>{exam.title}</h2>

                    {exam.description && <p>{exam.description}</p>}
                  </div>
                </div>

                <div className="operational-card-meta">
                  <span>
                    <Clock3 size={14} /> {formatDate(exam.opens_at)} –{' '}
                    {formatDate(exam.closes_at)}
                  </span>

                  <span>{exam.question_count} questions</span>

                  {complete && <strong>Completed</strong>}
                </div>

                <div className="operational-card-actions">
                  {canStart && (
                    <button
                      className="button button-primary"
                      onClick={() => openSession(exam, true)}
                      disabled={busy}
                    >
                      <Play size={15} /> Start examination
                    </button>
                  )}

                  {canResume && (
                    <button
                      className="button button-primary"
                      onClick={() => openSession(exam)}
                      disabled={busy}
                    >
                      <Play size={15} /> Continue examination
                    </button>
                  )}

                  {!canStart && !canResume && !complete && (
                    <span className="status-pill">Unavailable</span>
                  )}

                  {complete && (
                    <span className="payment-confirmed">
                      <CheckCircle2 size={15} /> Server scored
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
