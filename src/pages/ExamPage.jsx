import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Eye, Flag, Play, Send } from 'lucide-react';
import { Notice } from '../components/UI.jsx';
import { supabase } from '../lib/supabase.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function countdown(value) {
  const seconds = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ExamPage() {
  const [exams, setExams] = useState([]);
  const [activeExam, setActiveExam] = useState(null);
  const [session, setSession] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(1);
  const [remaining, setRemaining] = useState('00:00');
  const [timerLabel, setTimerLabel] = useState('Question timer');
  const [clockNow, setClockNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const autoSubmitted = useRef('');
  const autoAdvanced = useRef(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.rpc('get_student_exam_feed');
    if (loadError) setError(loadError.message);
    setExams(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openSession(exam, start = false) {
    setBusy(true); setError(''); setNotice('');
    const { data, error: rpcError } = await supabase.rpc(start ? 'start_examination' : 'get_examination_session',
      start ? { p_examination_id: exam.id } : { p_session_id: exam.session_id });
    if (rpcError) setError(rpcError.message);
    else {
      setActiveExam(exam);
      setSession(data);
      setCurrentPosition(1);
      setClockOffset(Date.parse(data.server_now || data.started_at) - Date.now());
      setClockNow(Date.parse(data.server_now || data.started_at));
      autoAdvanced.current = new Set();
      autoSubmitted.current = '';
    }
    setBusy(false);
  }

  async function saveChoice(position, choiceId) {
    if (!session || session.status !== 'in_progress') return;
    setBusy(true); setError('');
    const { error: answerError } = await supabase.rpc('submit_examination_answer', {
      p_session_id: session.id,
      p_position: position,
      p_choice_id: choiceId,
    });
    if (answerError) setError(answerError.message);
    else setSession((old) => ({ ...old, questions: old.questions.map((question) => question.position === position ? { ...question, selected_choice_id: choiceId } : question) }));
    setBusy(false);
  }

  const submit = useCallback(async (automatic = false) => {
    if (!session || session.status !== 'in_progress' || busy) return;
    if (automatic) autoSubmitted.current = session.id;
    setBusy(true);
    const { data, error: submitError } = await supabase.rpc('submit_examination', { p_session_id: session.id });
    if (submitError) setError(submitError.message);
    else {
      setSession((old) => ({ ...old, ...data, submitted_at: new Date().toISOString() }));
      setNotice(automatic ? 'The server timer ended. Your saved answers were submitted.' : 'Your answers were submitted and scored by the server.');
      await load();
    }
    setBusy(false);
  }, [session, busy, load]);

  useEffect(() => {
    if (!session || session.status !== 'in_progress') return undefined;
    const tick = () => {
      const now = Date.now() + clockOffset;
      setClockNow(now);
      const wholeExamDeadline = Date.parse(session.deadline_at);
      const selectedQuestion = session.questions.find((item) => item.position === currentPosition);
      if (selectedQuestion) {
        const questionStart = Date.parse(selectedQuestion.starts_at);
        const questionDeadline = Math.min(Date.parse(selectedQuestion.deadline_at), wholeExamDeadline);
        if (now < questionStart) {
          setTimerLabel('Question starts in');
          setRemaining(countdown(questionStart));
        } else if (now < questionDeadline) {
          setTimerLabel('Question timer');
          setRemaining(countdown(questionDeadline));
        } else {
          setTimerLabel('Question time ended');
          setRemaining('00:00');
          if (currentPosition < session.total_questions && !autoAdvanced.current.has(currentPosition)) {
            autoAdvanced.current.add(currentPosition);
            setCurrentPosition(currentPosition + 1);
          }
        }
      }
      if (now >= wholeExamDeadline && autoSubmitted.current !== session.id) submit(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, currentPosition, clockOffset, submit]);

  useEffect(() => {
    if (!session || session.status !== 'in_progress') return undefined;
    const log = (signal) => supabase.rpc('record_examination_signal', { p_session_id: session.id, p_signal: signal });
    const onVisibility = () => { if (document.visibilityState === 'hidden') log('tab_hidden'); };
    const onBlur = () => log('window_blur');
    const onOffline = () => log('connection_lost');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('offline', onOffline);
    };
  }, [session]);

  const question = session?.questions?.find((item) => item.position === currentPosition);
  const answered = session?.questions?.filter((item) => item.selected_choice_id).length || 0;
  const finished = session?.status === 'submitted' || session?.status === 'expired';
  const questionCanBeAnswered = Boolean(question && session?.status === 'in_progress'
    && clockNow >= Date.parse(question.starts_at)
    && clockNow < Date.parse(question.deadline_at)
    && clockNow < Date.parse(session.deadline_at));

  return (
    <section className="operational-page" aria-labelledby="exams-title">
      <div className="dashboard-section-heading"><div><div className="eyebrow">ASSESSMENTS</div><h1 id="exams-title">Examinations</h1></div><span className="section-note">Server timed · answers saved as you go</span></div>
      {error && <Notice>{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {activeExam && session ? (
        <article className="exam-panel">
          <header className="exam-panel-header">
            <div><span className="eyebrow">{activeExam.competition_title}</span><h2>{activeExam.title}</h2><p>Question {Math.min(currentPosition, session.total_questions)} of {session.total_questions} · {answered} saved</p></div>
            {session.status === 'in_progress' && <div className={`exam-timer${remaining === '00:00' ? ' exam-timer-ended' : ''}`}><Clock3 size={18} /><span>{timerLabel}</span><strong>{remaining}</strong></div>}
          </header>
          {finished ? (
            <div className="exam-result-card"><CheckCircle2 size={28} /><div><span>{session.status === 'expired' ? 'Time ended' : 'Submitted'}</span><strong>{Number(session.score || 0).toFixed(2)}%</strong><small>{session.correct_count || 0} correct out of {session.total_questions}</small></div><button className="button button-outline" onClick={() => { setActiveExam(null); setSession(null); load(); }}>Back to exams</button></div>
          ) : (
            <>
              <div className="exam-progress-track"><span style={{ width: `${(currentPosition / session.total_questions) * 100}%` }} /></div>
              {question && <div className="exam-question"><div className="exam-question-number">QUESTION {String(question.position).padStart(2, '0')}</div><h3>{question.prompt}</h3><div className="exam-choice-list">
                {question.choices.map((choice) => <button key={choice.id} type="button" className={`exam-choice${question.selected_choice_id === choice.id ? ' selected' : ''}`} onClick={() => saveChoice(question.position, choice.id)} disabled={busy || !questionCanBeAnswered}>
                  <span className="exam-choice-letter">{choice.id.toUpperCase()}</span>{choice.text}
                </button>)}
              </div>{!questionCanBeAnswered && session.status === 'in_progress' && <p className="exam-question-note">{clockNow < Date.parse(question.starts_at) ? 'This question opens when its time window begins.' : 'This question’s answer window has ended.'}</p>}</div>}
              <footer className="exam-controls">
                <button className="button button-quiet" onClick={() => setCurrentPosition((value) => Math.max(1, value - 1))} disabled={!activeExam.allow_previous_navigation || currentPosition <= 1 || busy}><ArrowLeft size={16} /> Previous</button>
                <span className="exam-control-note"><Eye size={14} /> Focus changes are recorded as review signals only.</span>
                {currentPosition < session.total_questions
                  ? <button className="button button-primary" onClick={() => setCurrentPosition((value) => Math.min(session.total_questions, value + 1))} disabled={busy}>Next <ArrowRight size={16} /></button>
                  : <button className="button button-primary" onClick={() => submit(false)} disabled={busy}><Send size={15} /> {busy ? 'Submitting…' : 'Submit exam'}</button>}
              </footer>
            </>
          )}
        </article>
      ) : loading ? <div className="competition-empty"><span className="loading-inline" /> Loading your examination schedule…</div> : exams.length === 0 ? (
        <div className="competition-empty"><Clock3 size={22} /><h3>No examinations scheduled for you</h3><p>Only students with verified competition payments can enter an examination.</p></div>
      ) : (
        <div className="operational-list">
          {exams.map((exam) => {
            const canStart = exam.window_open && !exam.session_id;
            const canResume = exam.session_id && exam.session_status === 'in_progress';
            const complete = exam.session_status === 'submitted' || exam.session_status === 'expired';
            return <article className="operational-card" key={exam.id}>
              <div className="operational-card-main"><div className="panel-icon cyan-icon"><Flag size={17} /></div><div><span className="eyebrow">{exam.competition_title}</span><h2>{exam.title}</h2><p>{exam.exam_type === 'grand_weekly' ? `Grand Competition · week ${exam.week_number}` : exam.exam_type === 'grand_final' ? 'Grand Competition · final examination' : 'Weekly Arena examination'}</p></div></div>
              <div className="operational-card-meta"><span><Clock3 size={14} /> {formatDate(exam.opens_at)} – {formatDate(exam.closes_at)}</span><span>{exam.question_count} questions · {exam.seconds_per_question} seconds each</span>{complete && <strong>Score: {Number(exam.score || 0).toFixed(2)}%</strong>}</div>
              <div className="operational-card-actions">
                {canStart && <button className="button button-primary" onClick={() => openSession(exam, true)} disabled={busy}><Play size={15} /> Start examination</button>}
                {canResume && <button className="button button-primary" onClick={() => openSession(exam)} disabled={busy}><Play size={15} /> Continue</button>}
                {!canStart && !canResume && !complete && <span className="status-pill">{exam.session_status ? 'Window closed' : 'Opens at scheduled time'}</span>}
                {complete && <span className="payment-confirmed"><CheckCircle2 size={15} /> Server scored</span>}
              </div>
            </article>;
          })}
        </div>
      )}
      {session?.status === 'in_progress' && <p className="operational-disclaimer"><AlertTriangle size={14} /> Your answers save when you choose an option. The server controls the timer; leaving the page does not pause it. Connectivity and focus events are recorded for review, not automatic disqualification.</p>}
    </section>
  );
}
