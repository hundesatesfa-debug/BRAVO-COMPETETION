import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Eye, FilePlus2, FileText, Plus, Presentation, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { supabase } from '../../lib/supabase.js';

const choiceIds = ['a', 'b', 'c', 'd'];
const questionPageSize = 20;
const difficultyOptions = [
  { value: 'introductory', label: 'Introductory' },
  { value: 'standard', label: 'Standard' },
  { value: 'advanced', label: 'Advanced' },
];
const importFields = new Set(['prompt', 'choices', 'correct_choice_id', 'explanation', 'difficulty', 'topic_id']);
const blankQuestion = { id: '', course_id: '', topic_id: '', prompt: '', choices: ['', '', '', ''], correct_choice_id: 'a', explanation: '', difficulty: 'standard', active: true };

function validateImportedQuestion(row, index, courseId, defaultTopicId, topics) {
  const errors = [];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { index, source: row, errors: ['Each item must be a question object.'], question: null };
  }

  Object.keys(row).filter((key) => !importFields.has(key)).forEach((key) => {
    errors.push(`Unsupported field "${key}".`);
  });

  const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : '';
  if (prompt.length < 5 || prompt.length > 3000) {
    errors.push('Question text must be 5 to 3,000 characters.');
  }

  const choicesById = {};
  const seenChoiceIds = new Set();
  if (!Array.isArray(row.choices) || row.choices.length !== 4) {
    errors.push('Choices must be an array containing exactly four options.');
  } else {
    row.choices.forEach((choice, choiceIndex) => {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        errors.push(`Choice ${choiceIndex + 1} must be an object with id and text.`);
        return;
      }

      if (!choiceIds.includes(choice.id)) {
        errors.push(`Choice ${choiceIndex + 1} must use an id from a, b, c, or d.`);
      } else if (seenChoiceIds.has(choice.id)) {
        errors.push(`Choice id "${choice.id}" is repeated.`);
      } else {
        seenChoiceIds.add(choice.id);
      }

      if (typeof choice.text !== 'string' || !choice.text.trim()) {
        errors.push(`Choice ${choiceIndex + 1} needs non-empty text.`);
      } else if (choice.text.trim().length > 500) {
        errors.push(`Choice ${choiceIndex + 1} must be 500 characters or fewer.`);
      } else if (choiceIds.includes(choice.id)) {
        choicesById[choice.id] = choice.text.trim();
      }
    });

    if (seenChoiceIds.size !== choiceIds.length) {
      errors.push('Include each choice id a, b, c, and d exactly once.');
    }
  }

  if (!choiceIds.includes(row.correct_choice_id)) {
    errors.push('Correct choice must be one of a, b, c, or d.');
  } else if (!seenChoiceIds.has(row.correct_choice_id)) {
    errors.push('Correct choice must match one of the four supplied choices.');
  }

  const difficulty = Object.prototype.hasOwnProperty.call(row, 'difficulty') ? row.difficulty : 'standard';
  if (!difficultyOptions.some((option) => option.value === difficulty)) {
    errors.push('Difficulty must be introductory, standard, or advanced.');
  }

  let explanation = null;
  if (Object.prototype.hasOwnProperty.call(row, 'explanation') && row.explanation !== null) {
    if (typeof row.explanation !== 'string') {
      errors.push('Explanation must be text or null.');
    } else if (row.explanation.trim().length > 2000) {
      errors.push('Explanation must be 2,000 characters or fewer.');
    } else {
      explanation = row.explanation.trim() || null;
    }
  }

  let topicId = defaultTopicId || null;
  if (Object.prototype.hasOwnProperty.call(row, 'topic_id') && row.topic_id !== null) {
    if (typeof row.topic_id !== 'string') {
      errors.push('Topic id must be text or null.');
    } else if (row.topic_id.trim()) {
      topicId = row.topic_id.trim();
      if (!topics.some((topic) => topic.id === topicId && topic.course_id === courseId)) {
        errors.push('Topic id must belong to the selected course.');
      }
    }
  }

  const question = errors.length ? null : {
    topic_id: topicId,
    prompt,
    choices: choiceIds.map((id) => ({ id, text: choicesById[id] })),
    correct_choice_id: row.correct_choice_id,
    explanation,
    difficulty,
  };
  return { index, source: row, errors, question };
}

function formatUpdatedAt(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminAcademics() {
  const { account } = useAuth();
  const [courses, setCourses] = useState([]);
  const [academicLevels, setAcademicLevels] = useState([]);
  const [streams, setStreams] = useState([]);
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [courseForm, setCourseForm] = useState({ code: '', title: '', academic_level: '', stream: '' });
  const [topicForm, setTopicForm] = useState({ title: '', week_number: '' });
  const [materialForm, setMaterialForm] = useState({ course_id: '', title: '', description: '', file: null });
  const [question, setQuestion] = useState(blankQuestion);
  const [bulkJson, setBulkJson] = useState('');
  const [importCourseId, setImportCourseId] = useState('');
  const [importTopicId, setImportTopicId] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [questionFilters, setQuestionFilters] = useState({ courseId: '', topicId: '', difficulty: 'all', status: 'all' });
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [questionSearchInput, setQuestionSearchInput] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionPage, setQuestionPage] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [questionLoading, setQuestionLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const questionSaveLock = useRef(false);
  const importLock = useRef(false);
  const questionRequestId = useRef(0);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true); setError('');
    const [courseResult, levelResult, streamResult, topicResult, materialResult] = await Promise.all([
      supabase.from('courses').select('*').order('title'),
      supabase.from('academic_levels').select('id, name').order('id'),
      supabase.from('streams').select('id, name').order('id'),
      supabase.from('academic_topics').select('*').order('week_number').order('title'),
      supabase.from('academic_materials').select('*').order('created_at', { ascending: false }).limit(300),
    ]);
    const firstError = courseResult.error || levelResult.error || streamResult.error || topicResult.error || materialResult.error;
    if (firstError) setError(firstError.message);
    setCourses(courseResult.data || []); setTopics(topicResult.data || []); setMaterials(materialResult.data || []);
    setAcademicLevels(levelResult.data || []); setStreams(streamResult.data || []);
    setCatalogLoading(false);
  }, []);

  const loadQuestions = useCallback(async () => {
    const requestId = ++questionRequestId.current;
    setQuestionLoading(true); setError('');
    const search = questionSearch.trim();
    let query = supabase.from('question_bank').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) query = query.ilike('prompt', `%${search}%`);
    if (questionFilters.courseId) query = query.eq('course_id', questionFilters.courseId);
    if (questionFilters.topicId) query = query.eq('topic_id', questionFilters.topicId);
    if (questionFilters.difficulty !== 'all') query = query.eq('difficulty', questionFilters.difficulty);
    if (questionFilters.status !== 'all') query = query.eq('active', questionFilters.status === 'active');
    const start = questionPage * questionPageSize;
    const { data, error: loadError, count } = await query.range(start, start + questionPageSize - 1);
    if (requestId !== questionRequestId.current) return;
    if (loadError) setError(loadError.message);
    setQuestions(data || []); setQuestionCount(count || 0);
    setQuestionLoading(false);
  }, [questionFilters.courseId, questionFilters.difficulty, questionFilters.status, questionFilters.topicId, questionPage, questionSearch]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  useEffect(() => { loadQuestions(); }, [loadQuestions]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuestionSearch(questionSearchInput.trim());
      setQuestionPage(0);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [questionSearchInput]);
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(questionCount / questionPageSize) - 1);
    if (questionPage > lastPage) setQuestionPage(lastPage);
  }, [questionCount, questionPage]);

  async function load() {
    await Promise.all([loadCatalog(), loadQuestions()]);
  }

  async function saveCourse(event) {
    event.preventDefault(); setBusy('course'); setError(''); setSuccess('');
    const code = courseForm.code.trim().toUpperCase();
    if (courses.some((course) => course.code === code)) {
      setError(`Course code "${code}" already exists. Select that course or use a different code.`);
      setBusy('');
      return;
    }

    const { error: saveError } = await supabase.from('courses').insert({
      ...courseForm,
      code,
      academic_level: courseForm.academic_level ? Number(courseForm.academic_level) : null,
      stream: courseForm.stream ? Number(courseForm.stream) : null,
      created_by: account.user.id,
    });
    if (saveError) {
      setError(
        saveError.code === '23505' && saveError.message.includes('courses_code_key')
          ? `Course code "${code}" already exists. Select that course or use a different code.`
          : saveError.message
      );
    } else { setCourseForm({ code: '', title: '', academic_level: '', stream: '' }); setSuccess('Course added.'); await load(); }
    setBusy('');
  }

  async function saveTopic(event) {
    event.preventDefault(); setBusy('topic'); setError(''); setSuccess('');
    const { error: saveError } = await supabase.from('academic_topics').insert({ course_id: question.course_id, title: topicForm.title.trim(), week_number: topicForm.week_number ? Number(topicForm.week_number) : null, created_by: account.user.id });
    if (saveError) setError(saveError.message); else { setTopicForm({ title: '', week_number: '' }); setSuccess('Topic added.'); await load(); }
    setBusy('');
  }

  async function uploadMaterial(event) {
    event.preventDefault(); setBusy('material'); setError(''); setSuccess('');
    const file = materialForm.file;
    if (!file || !materialForm.course_id) { setError('Choose a course and a PDF or presentation file.'); setBusy(''); return; }
    if (file.size < 1 || file.size > 50 * 1024 * 1024) { setError('Course materials must be smaller than 50 MB.'); setBusy(''); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'pdf' ? 'application/pdf'
      : extension === 'ppt' ? 'application/vnd.ms-powerpoint'
        : extension === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : '';
    if (!mimeType) { setError('Choose a PDF, PPT, or PPTX file.'); setBusy(''); return; }
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-100) || `material.${extension}`;
    const objectPath = `${materialForm.course_id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('academic-materials').upload(objectPath, file, { contentType: mimeType, upsert: false });
    if (uploadError) { setError(uploadError.message); setBusy(''); return; }
    const { error: insertError } = await supabase.from('academic_materials').insert({
      course_id: materialForm.course_id, title: materialForm.title.trim(), description: materialForm.description.trim() || null,
      object_path: objectPath, mime_type: mimeType, size_bytes: file.size, created_by: account.user.id,
    });
    if (insertError) {
      await supabase.storage.from('academic-materials').remove([objectPath]);
      setError(insertError.message);
    } else {
      setMaterialForm({ course_id: materialForm.course_id, title: '', description: '', file: null });
      setSuccess('Official course material published.'); await load();
    }
    setBusy('');
  }

  async function setMaterialActive(material, active) {
    setBusy(material.id); setError(''); setSuccess('');
    const { error: updateError } = await supabase.from('academic_materials').update({ active }).eq('id', material.id);
    if (updateError) setError(updateError.message); else { setSuccess(active ? 'Material published.' : 'Material hidden from students.'); await load(); }
    setBusy('');
  }

  async function deleteMaterial(material) {
    if (!window.confirm(`Permanently remove “${material.title}” and its stored file?`)) return;
    setBusy(material.id); setError(''); setSuccess('');
    const { error: storageError } = await supabase.storage.from('academic-materials').remove([material.object_path]);
    if (storageError) { setError(storageError.message); setBusy(''); return; }
    const { error: deleteError } = await supabase.from('academic_materials').delete().eq('id', material.id);
    if (deleteError) setError(deleteError.message); else { setSuccess('Course material removed.'); await load(); }
    setBusy('');
  }

  function editQuestion(row) {
    setQuestion({ id: row.id, course_id: row.course_id, topic_id: row.topic_id || '', prompt: row.prompt,
      choices: choiceIds.map((id) => row.choices.find((choice) => choice.id === id)?.text || ''),
      correct_choice_id: row.correct_choice_id, explanation: row.explanation || '', difficulty: row.difficulty, active: row.active });
    setSelectedQuestion(row);
    setShowQuestionForm(true);
    window.setTimeout(() => document.getElementById('question-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  async function saveQuestion(event) {
    event.preventDefault();
    if (questionSaveLock.current) return;
    questionSaveLock.current = true;
    setBusy('question'); setError(''); setSuccess('');
    try {
      const trimmedChoices = question.choices.map((choice) => choice.trim());
      const topicMatchesCourse = !question.topic_id
        || topics.some((topic) => topic.id === question.topic_id && topic.course_id === question.course_id);
      if (!question.course_id || question.prompt.trim().length < 5 || question.prompt.trim().length > 3000
        || trimmedChoices.some((choice) => !choice || choice.length > 500)
        || !choiceIds.includes(question.correct_choice_id)
        || !difficultyOptions.some((option) => option.value === question.difficulty)
        || !topicMatchesCourse) {
        setError('Enter a valid course and topic, question, four non-empty choices, correct answer, and difficulty.');
        return;
      }

      const payload = { course_id: question.course_id, topic_id: question.topic_id || null, prompt: question.prompt.trim(),
        choices: choiceIds.map((id, index) => ({ id, text: trimmedChoices[index] })),
        correct_choice_id: question.correct_choice_id, explanation: question.explanation.trim() || null,
        difficulty: question.difficulty, active: question.active, created_by: account.user.id };
      const result = question.id
        ? await supabase.from('question_bank').update(payload).eq('id', question.id)
        : await supabase.from('question_bank').insert(payload);
      if (result.error) {
        setError(result.error.message);
      } else {
        setQuestion({ ...blankQuestion }); setSelectedQuestion(null); setShowQuestionForm(false);
        setSuccess(question.id ? 'Question updated.' : 'Question added.');
        if (!question.id) setQuestionPage(0);
        await load();
      }
    } finally {
      questionSaveLock.current = false;
      setBusy('');
    }
  }

  async function setQuestionActive(row, active) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: updateError } = await supabase.from('question_bank').update({ active }).eq('id', row.id);
    if (updateError) setError(updateError.message);
    else {
      setSelectedQuestion((current) => current?.id === row.id ? { ...current, active } : current);
      setSuccess(active ? 'Question activated.' : 'Question deactivated.'); await load();
    }
    setBusy('');
  }

  function updateQuestionFilters(updates) {
    setQuestionFilters((current) => ({ ...current, ...updates }));
    setQuestionPage(0);
  }

  function prepareImport(event) {
    event.preventDefault(); setError(''); setSuccess(''); setImportError(''); setImportPreview(null);
    if (!importCourseId) { setImportError('Choose a course for this import.'); return; }

    let parsed;
    try {
      parsed = JSON.parse(bulkJson);
    } catch {
      setImportError('The input is not valid JSON. Check the formatting and try again.');
      return;
    }
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) {
      setImportError('Import must be a JSON array containing 1 to 100 questions.');
      return;
    }

    const rows = parsed.map((row, index) => validateImportedQuestion(row, index + 1, importCourseId, importTopicId, topics));
    setImportPreview(rows);
    const validCount = rows.filter((row) => !row.errors.length).length;
    const invalidCount = rows.filter((row) => row.errors.length).length;
    setImportError(`${validCount} valid · ${invalidCount} invalid. Review both groups; only valid questions can be imported.`);
  }

  async function importQuestions() {
    const validRows = importPreview?.filter((row) => !row.errors.length) || [];
    if (!validRows.length || !importCourseId || importLock.current) return;
    if (!window.confirm(`Import ${validRows.length} valid question${validRows.length === 1 ? '' : 's'}? Invalid rows will be left for correction.`)) return;
    importLock.current = true;
    setBusy('import'); setError(''); setSuccess(''); setImportError('');
    try {
      const records = validRows.map(({ question: row }) => ({
        course_id: importCourseId,
        topic_id: row.topic_id,
        prompt: row.prompt,
        choices: row.choices,
        correct_choice_id: row.correct_choice_id,
        explanation: row.explanation,
        difficulty: row.difficulty,
        active: true,
        created_by: account.user.id,
      }));
      const { error: saveError } = await supabase.from('question_bank').insert(records);
      if (saveError) {
        setError(saveError.message);
      } else {
        const invalidRows = importPreview.filter((row) => row.errors.length);
        setBulkJson(invalidRows.length ? JSON.stringify(invalidRows.map((row) => row.source), null, 2) : '');
        setImportPreview(null);
        if (!invalidRows.length) { setImportCourseId(''); setImportTopicId(''); setShowImportForm(false); }
        setSuccess(`${records.length} valid question${records.length === 1 ? '' : 's'} imported.${invalidRows.length ? ` ${invalidRows.length} invalid row${invalidRows.length === 1 ? '' : 's'} remain in the editor.` : ''}`);
        setQuestionPage(0);
        await load();
      }
    } finally {
      importLock.current = false;
      setBusy('');
    }
  }

  const scopedTopics = topics.filter((topic) => topic.course_id === question.course_id);
  const importTopics = topics.filter((topic) => topic.course_id === importCourseId);
  const previewQuestion = selectedQuestion;
  const invalidImportCount = importPreview?.filter((row) => row.errors.length).length || 0;
  const validImportCount = importPreview?.length - invalidImportCount || 0;
  const totalQuestionPages = Math.max(1, Math.ceil(questionCount / questionPageSize));
  const importTopicOptions = questionFilters.courseId
    ? topics.filter((topic) => topic.course_id === questionFilters.courseId)
    : topics;
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">EXAM CONTENT</div><h1>Courses & question bank</h1></div><span className="section-note">Question keys remain admin-only.</span></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <div className="admin-two-column">
      <form className="admin-panel admin-form" onSubmit={saveCourse}><div className="admin-panel-title"><div><div className="eyebrow">ACADEMIC CATALOG</div><h2>Add a course</h2></div><BookOpen size={18} /></div>
        <label className="field-label">Course code<input className="competition-input" value={courseForm.code} required maxLength={24} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value.toUpperCase() })} placeholder="BIO101" /></label>
        <label className="field-label">Course name<input className="competition-input" value={courseForm.title} required maxLength={120} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label>
        <label className="field-label">Academic level<select className="competition-input" value={courseForm.academic_level} onChange={(event) => setCourseForm({ ...courseForm, academic_level: event.target.value })}><option value="">All levels</option>{academicLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
        <label className="field-label">Stream<select className="competition-input" value={courseForm.stream} onChange={(event) => setCourseForm({ ...courseForm, stream: event.target.value })}><option value="">All streams</option>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>
        <button className="button button-primary" disabled={busy === 'course'}><Plus size={15} /> Add course</button>
      </form>
      <form className="admin-panel admin-form" onSubmit={saveTopic}><div className="admin-panel-title"><div><div className="eyebrow">TOPIC GROUPING</div><h2>Add a topic</h2></div></div>
        <label className="field-label">Course<select className="competition-input" required value={question.course_id} onChange={(event) => setQuestion((current) => ({ ...current, course_id: event.target.value, topic_id: '' }))}><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
        <label className="field-label">Topic name<input className="competition-input" value={topicForm.title} required maxLength={160} onChange={(event) => setTopicForm({ ...topicForm, title: event.target.value })} /></label>
        <label className="field-label">Week (optional)<input className="competition-input" type="number" min="1" max="16" value={topicForm.week_number} onChange={(event) => setTopicForm({ ...topicForm, week_number: event.target.value })} /></label>
        <button className="button button-outline" disabled={busy === 'topic' || !question.course_id}><Plus size={15} /> Add topic</button>
      </form>
    </div>

    <div className="admin-two-column admin-academic-materials">
      <form className="admin-panel admin-form" onSubmit={uploadMaterial}>
        <div className="admin-panel-title"><div><div className="eyebrow">OFFICIAL STUDY LIBRARY</div><h2>Publish course material</h2></div><Upload size={18} /></div>
        <label className="field-label">Course<select className="competition-input" required value={materialForm.course_id} onChange={(event) => setMaterialForm({ ...materialForm, course_id: event.target.value })}><option value="">Choose course</option>{courses.filter((course) => course.active).map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
        <label className="field-label">Title<input className="competition-input" required minLength={2} maxLength={120} value={materialForm.title} onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} /></label>
        <label className="field-label">Description (optional)<textarea className="competition-input" rows="2" maxLength={1000} value={materialForm.description} onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} /></label>
        <label className="field-label">PDF or presentation<input className="competition-input" required type="file" accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setMaterialForm({ ...materialForm, file: event.target.files?.[0] || null })} /></label>
        <p className="field-hint">Files are private. Students see active materials assigned to their academic level and stream. Maximum size: 50 MB.</p>
        <button className="button button-primary" disabled={busy === 'material' || !courses.length}><Upload size={15} /> {busy === 'material' ? 'Uploading…' : 'Publish material'}</button>
      </form>
      <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">{materials.length} FILES</div><h2>Published materials</h2></div></div>
        {catalogLoading ? <p className="empty-copy">Loading published materials…</p> : !materials.length ? <p className="empty-copy">No official course files yet.</p> : <div className="admin-question-list">{materials.map((material) => {
          const course = courses.find((item) => item.id === material.course_id);
          const Icon = material.mime_type === 'application/pdf' ? FileText : Presentation;
          return <article className="admin-question-row" key={material.id}><div className="admin-material-label"><Icon size={16} /><span><strong>{material.title}</strong><small>{course?.code || 'Course'} · {material.active ? 'Visible to matching students' : 'Hidden'} · {Math.ceil(material.size_bytes / (1024 * 1024))} MB</small></span></div><div className="admin-row-actions"><button className="button button-quiet button-compact" disabled={busy === material.id} onClick={() => setMaterialActive(material, !material.active)}>{material.active ? 'Hide' : 'Publish'}</button><button className="icon-button" aria-label={`Delete ${material.title}`} disabled={busy === material.id} onClick={() => deleteMaterial(material)}><Trash2 size={15} /></button></div></article>;
        })}</div>}
      </div>
    </div>

    {showQuestionForm && <form className="admin-panel admin-form question-editor" id="question-editor" onSubmit={saveQuestion}><div className="admin-panel-title"><div><div className="eyebrow">MULTIPLE CHOICE · FOUR OPTIONS</div><h2>{question.id ? 'Edit question' : 'Add question'}</h2></div><button type="button" className="icon-button" aria-label="Close question editor" onClick={() => { setShowQuestionForm(false); setQuestion({ ...blankQuestion }); }}><X size={16} /></button></div>
      <div className="admin-form-grid">
        <label className="field-label">Course<select className="competition-input" required value={question.course_id} onChange={(event) => setQuestion({ ...question, course_id: event.target.value, topic_id: '' })}><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
        <label className="field-label">Topic<select className="competition-input" value={question.topic_id} onChange={(event) => setQuestion({ ...question, topic_id: event.target.value })}><option value="">Whole course</option>{scopedTopics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}</select></label>
        <label className="field-label admin-span-2">Question<textarea className="competition-input" required minLength={5} maxLength={3000} value={question.prompt} onChange={(event) => setQuestion({ ...question, prompt: event.target.value })} /></label>
        {choiceIds.map((id, index) => <label className="field-label" key={id}><span className="choice-input-title"><input type="radio" name="correct-choice" checked={question.correct_choice_id === id} onChange={() => setQuestion({ ...question, correct_choice_id: id })} /> Correct choice {id.toUpperCase()}</span><input className="competition-input" required maxLength={500} value={question.choices[index]} onChange={(event) => setQuestion({ ...question, choices: question.choices.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })} /></label>)}
        <label className="field-label">Difficulty<select className="competition-input" value={question.difficulty} onChange={(event) => setQuestion({ ...question, difficulty: event.target.value })}><option value="introductory">Introductory</option><option value="standard">Standard</option><option value="advanced">Advanced</option></select></label>
        <label className="field-label">Explanation (optional)<input className="competition-input" value={question.explanation} maxLength={2000} onChange={(event) => setQuestion({ ...question, explanation: event.target.value })} /></label>
      </div>
      <label className="question-active-toggle"><input type="checkbox" checked={question.active} onChange={(event) => setQuestion({ ...question, active: event.target.checked })} /><span><strong>Active</strong><small>Active questions can be selected for exams.</small></span></label>
      <div className="admin-form-actions"><button className="button button-primary" disabled={busy === 'question'}><Save size={15} /> {busy === 'question' ? 'Saving…' : question.id ? 'Save question' : 'Add question'}</button></div>
    </form>
    }

    {showImportForm && <form className="admin-panel admin-form" onSubmit={prepareImport}><div className="admin-panel-title"><div><div className="eyebrow">BULK IMPORT</div><h2>Review questions before import</h2></div><FilePlus2 size={18} /></div>
      <p className="empty-copy">Use the existing four-choice format. Each question needs prompt, four choices with ids a–d, and correct_choice_id. Explanation, difficulty, and topic_id are optional.</p>
      <div className="admin-form-grid">
        <label className="field-label">Course<select className="competition-input" required value={importCourseId} onChange={(event) => { setImportCourseId(event.target.value); setImportTopicId(''); setImportPreview(null); setImportError(''); }}><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
        <label className="field-label">Default topic (optional)<select className="competition-input" value={importTopicId} onChange={(event) => { setImportTopicId(event.target.value); setImportPreview(null); setImportError(''); }} disabled={!importCourseId}><option value="">No default topic</option>{importTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
      </div>
      <label className="field-label">Question JSON<textarea className="competition-input admin-code-input" rows="7" value={bulkJson} onChange={(event) => { setBulkJson(event.target.value); setImportPreview(null); setImportError(''); }} placeholder={'[{"prompt":"...","choices":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correct_choice_id":"a"}]'} /></label>
      {importError && <p className={`question-import-message${invalidImportCount ? ' question-import-message-error' : importPreview ? ' question-import-message-success' : ''}`} role="status">{importError}</p>}
      {importPreview && <div className="question-import-preview">
        <div className="admin-panel-title"><h3>Import preview ({validImportCount} valid, {invalidImportCount} invalid)</h3></div>
        <div className="question-import-group"><h4>Valid questions</h4>
          {!validImportCount ? <p className="empty-copy">No valid questions to import.</p> : <div className="question-import-list">{importPreview.filter((row) => !row.errors.length).map((row) => <article className="question-import-row" key={row.index}>
            <div className="question-import-row-heading"><strong>Question {row.index}</strong><span>{difficultyOptions.find((option) => option.value === row.question.difficulty)?.label}</span></div>
            <p>{row.question.prompt}</p>
            <ol className="question-preview-choices">{row.question.choices.map((choice) => <li className={choice.id === row.question.correct_choice_id ? 'is-correct' : ''} key={choice.id}><span>{choice.id.toUpperCase()}</span>{choice.text}{choice.id === row.question.correct_choice_id && <strong><Check size={13} /> Correct</strong>}</li>)}</ol>
          </article>)}</div>}
        </div>
        {!!invalidImportCount && <div className="question-import-group"><h4>Invalid questions</h4><div className="question-import-list">{importPreview.filter((row) => row.errors.length).map((row) => <article className="question-import-row is-invalid" key={row.index}>
          <div className="question-import-row-heading"><strong>Question {row.index}</strong><span>Needs correction</span></div>
          <p>{typeof row.source?.prompt === 'string' ? row.source.prompt : 'Question text unavailable.'}</p>
          <ul className="question-import-errors">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>
        </article>)}</div></div>}
        <div className="admin-form-actions">
          <button type="button" className="button button-quiet" onClick={() => { setImportPreview(null); setImportError(''); }}>Cancel preview</button>
          <button type="button" className="button button-primary" onClick={importQuestions} disabled={busy === 'import' || !validImportCount}><FilePlus2 size={15} /> {busy === 'import' ? 'Importing…' : `Import ${validImportCount} valid questions`}</button>
        </div>
      </div>}
      {!importPreview && <button className="button button-outline" disabled={busy === 'import' || !bulkJson.trim()}><Eye size={15} /> Validate and preview</button>}
    </form>
    }

    <div className={`question-bank-layout${previewQuestion ? ' has-preview' : ''}`}>
      <div className="admin-panel question-bank-table-panel">
        <div className="admin-panel-title">
          <div><div className="eyebrow">{questionCount} QUESTIONS</div><h2>Question bank</h2></div>
          <div className="admin-row-actions">
            <button type="button" className="button button-outline button-compact" onClick={() => { setQuestion({ ...blankQuestion }); setShowQuestionForm(true); }}><Plus size={14} /> Add question</button>
            <button type="button" className="button button-primary button-compact" onClick={() => setShowImportForm((current) => !current)}><FilePlus2 size={14} /> {showImportForm ? 'Close import' : 'Import JSON'}</button>
          </div>
        </div>
        <div className="question-bank-filters">
          <label className="admin-search question-bank-search"><Search size={16} /><input aria-label="Search question text" value={questionSearchInput} onChange={(event) => setQuestionSearchInput(event.target.value)} placeholder="Search question text" /></label>
          <label className="field-label">Course<select className="competition-input" value={questionFilters.courseId} onChange={(event) => updateQuestionFilters({ courseId: event.target.value, topicId: '' })}><option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
          <label className="field-label">Topic<select className="competition-input" value={questionFilters.topicId} onChange={(event) => updateQuestionFilters({ topicId: event.target.value })}><option value="">All topics</option>{importTopicOptions.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select></label>
          <label className="field-label">Difficulty<select className="competition-input" value={questionFilters.difficulty} onChange={(event) => updateQuestionFilters({ difficulty: event.target.value })}><option value="all">All difficulties</option>{difficultyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="field-label">Status<select className="competition-input" value={questionFilters.status} onChange={(event) => updateQuestionFilters({ status: event.target.value })}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <button type="button" className="button button-quiet button-compact question-clear-filters" onClick={() => { setQuestionSearchInput(''); setQuestionSearch(''); setQuestionFilters({ courseId: '', topicId: '', difficulty: 'all', status: 'all' }); setQuestionPage(0); }}>Clear filters</button>
        </div>
        {questionLoading ? <p className="empty-copy">Loading question bank…</p> : questions.length === 0 ? <p className="empty-copy">{questionCount === 0 ? 'Add course questions to build your question bank.' : 'No questions match these filters.'}</p> : <div className="admin-table-wrap">
          <table className="admin-table question-bank-table">
            <thead><tr><th>Question</th><th>Course</th><th>Topic</th><th>Difficulty</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{questions.map((row) => {
              const course = courses.find((item) => item.id === row.course_id);
              const topic = topics.find((item) => item.id === row.topic_id);
              return <tr key={row.id} className={selectedQuestion?.id === row.id ? 'is-selected' : ''}>
                <td><strong>{row.prompt}</strong></td>
                <td>{course?.code || 'Course'}</td>
                <td>{topic?.title || 'Whole course'}</td>
                <td>{difficultyOptions.find((option) => option.value === row.difficulty)?.label || row.difficulty}</td>
                <td><span className={`question-status${row.active ? ' is-active' : ''}`}>{row.active ? 'Active' : 'Inactive'}</span></td>
                <td><div className="admin-row-actions">
                  <button type="button" className="button button-quiet button-compact" aria-expanded={selectedQuestion?.id === row.id} onClick={() => setSelectedQuestion((current) => current?.id === row.id ? null : row)}><Eye size={14} /> Preview</button>
                  <button type="button" className="button button-quiet button-compact" onClick={() => editQuestion(row)}>Edit</button>
                  <button type="button" className="button button-quiet button-compact" disabled={busy === row.id} onClick={() => setQuestionActive(row, !row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
        <div className="question-bank-pagination">
          <span>Showing {questionCount ? questionPage * questionPageSize + 1 : 0}–{Math.min((questionPage + 1) * questionPageSize, questionCount)} of {questionCount}</span>
          <div><button type="button" className="button button-quiet button-compact" aria-label="Previous page" disabled={questionPage === 0 || questionLoading} onClick={() => setQuestionPage((page) => page - 1)}><ChevronLeft size={15} /> Previous</button><span>Page {questionPage + 1} of {totalQuestionPages}</span><button type="button" className="button button-quiet button-compact" aria-label="Next page" disabled={questionPage + 1 >= totalQuestionPages || questionLoading} onClick={() => setQuestionPage((page) => page + 1)}>Next <ChevronRight size={15} /></button></div>
        </div>
      </div>
      {previewQuestion && <><button type="button" className="question-preview-backdrop" aria-label="Close question preview" onClick={() => setSelectedQuestion(null)} /><aside className="admin-panel question-bank-preview" aria-label="Admin question preview">
        <div className="admin-panel-title"><div><div className="eyebrow">ADMIN QUESTION PREVIEW</div><h3>{courses.find((course) => course.id === previewQuestion.course_id)?.code || 'Course'} · {topics.find((topic) => topic.id === previewQuestion.topic_id)?.title || 'Whole course'}</h3></div><button type="button" className="icon-button" aria-label="Close question preview" onClick={() => setSelectedQuestion(null)}><X size={16} /></button></div>
        <p className="question-preview-prompt">{previewQuestion.prompt}</p>
        <ol className="question-preview-choices">{choiceIds.map((id) => {
          const choice = Array.isArray(previewQuestion.choices) ? previewQuestion.choices.find((item) => item.id === id) : null;
          const correct = previewQuestion.correct_choice_id === id;
          return <li className={correct ? 'is-correct' : ''} key={id}><span>{id.toUpperCase()}</span>{choice?.text || 'Choice text unavailable'}{correct && <strong><Check size={13} /> Correct answer</strong>}</li>;
        })}</ol>
        <div className="question-preview-meta"><span>Course: <strong>{courses.find((course) => course.id === previewQuestion.course_id)?.title || 'Unavailable'}</strong></span><span>Topic: <strong>{topics.find((topic) => topic.id === previewQuestion.topic_id)?.title || 'Whole course'}</strong></span><span>Difficulty: <strong>{difficultyOptions.find((option) => option.value === previewQuestion.difficulty)?.label || previewQuestion.difficulty}</strong></span><span>Status: <strong>{previewQuestion.active ? 'Active' : 'Inactive'}</strong></span><span>Last updated: <strong>{formatUpdatedAt(previewQuestion.updated_at)}</strong></span></div>
        <p className="question-preview-explanation"><strong>Explanation</strong>{previewQuestion.explanation || 'No explanation provided.'}</p>
      </aside></>}
    </div>
  </section>;
}
