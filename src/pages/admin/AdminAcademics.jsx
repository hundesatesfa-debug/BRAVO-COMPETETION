import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FilePlus2, FileText, Plus, Presentation, Save, Trash2, Upload, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { supabase } from '../../lib/supabase.js';

const choiceIds = ['a', 'b', 'c', 'd'];
const blankQuestion = { id: '', course_id: '', topic_id: '', prompt: '', choices: ['', '', '', ''], correct_choice_id: 'a', explanation: '', difficulty: 'standard', active: true };

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [courseResult, levelResult, streamResult, topicResult, questionResult, materialResult] = await Promise.all([
      supabase.from('courses').select('*').order('title'),
      supabase.from('academic_levels').select('id, name').order('id'),
      supabase.from('streams').select('id, name').order('id'),
      supabase.from('academic_topics').select('*').order('week_number').order('title'),
      supabase.from('question_bank').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('academic_materials').select('*').order('created_at', { ascending: false }).limit(300),
    ]);
    const firstError = courseResult.error || levelResult.error || streamResult.error || topicResult.error || questionResult.error || materialResult.error;
    if (firstError) setError(firstError.message);
    setCourses(courseResult.data || []); setTopics(topicResult.data || []); setQuestions(questionResult.data || []); setMaterials(materialResult.data || []);
    setAcademicLevels(levelResult.data || []); setStreams(streamResult.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveQuestion(event) {
    event.preventDefault(); setBusy('question'); setError(''); setSuccess('');
    const payload = { course_id: question.course_id, topic_id: question.topic_id || null, prompt: question.prompt.trim(),
      choices: choiceIds.map((id, index) => ({ id, text: question.choices[index].trim() })),
      correct_choice_id: question.correct_choice_id, explanation: question.explanation.trim() || null,
      difficulty: question.difficulty, active: question.active, created_by: account.user.id };
    let result = question.id ? await supabase.from('question_bank').update(payload).eq('id', question.id) : await supabase.from('question_bank').insert(payload);
    if (result.error) setError(result.error.message); else { setQuestion({ ...blankQuestion }); setSuccess(question.id ? 'Question updated.' : 'Question added.'); await load(); }
    setBusy('');
  }

  async function deleteQuestion(row) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: deleteError } = await supabase.from('question_bank').delete().eq('id', row.id);
    if (deleteError) setError(deleteError.message); else { setSuccess('Question deleted.'); await load(); }
    setBusy('');
  }

  async function importQuestions(event) {
    event.preventDefault(); setBusy('import'); setError(''); setSuccess('');
    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) throw new Error('Import a JSON array containing 1 to 100 questions.');
      const records = parsed.map((row) => ({
        course_id: question.course_id,
        topic_id: row.topic_id || question.topic_id || null,
        prompt: row.prompt,
        choices: row.choices,
        correct_choice_id: row.correct_choice_id,
        explanation: row.explanation || null,
        difficulty: row.difficulty || 'standard',
        active: true,
        created_by: account.user.id,
      }));
      if (!question.course_id) throw new Error('Choose the course used for this import.');
      const { error: importError } = await supabase.from('question_bank').insert(records);
      if (importError) throw importError;
      setBulkJson(''); setSuccess(`${records.length} questions imported.`); await load();
    } catch (importError) { setError(importError.message || 'The question import could not be read.'); }
    setBusy('');
  }

  const scopedTopics = topics.filter((topic) => topic.course_id === question.course_id);
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
        {!materials.length ? <p className="empty-copy">No official course files yet.</p> : <div className="admin-question-list">{materials.map((material) => {
          const course = courses.find((item) => item.id === material.course_id);
          const Icon = material.mime_type === 'application/pdf' ? FileText : Presentation;
          return <article className="admin-question-row" key={material.id}><div className="admin-material-label"><Icon size={16} /><span><strong>{material.title}</strong><small>{course?.code || 'Course'} · {material.active ? 'Visible to matching students' : 'Hidden'} · {Math.ceil(material.size_bytes / (1024 * 1024))} MB</small></span></div><div className="admin-row-actions"><button className="button button-quiet button-compact" disabled={busy === material.id} onClick={() => setMaterialActive(material, !material.active)}>{material.active ? 'Hide' : 'Publish'}</button><button className="icon-button" aria-label={`Delete ${material.title}`} disabled={busy === material.id} onClick={() => deleteMaterial(material)}><Trash2 size={15} /></button></div></article>;
        })}</div>}
      </div>
    </div>

    <form className="admin-panel admin-form" onSubmit={saveQuestion}><div className="admin-panel-title"><div><div className="eyebrow">MULTIPLE CHOICE · FOUR OPTIONS</div><h2>{question.id ? 'Edit question' : 'Add question'}</h2></div>{question.id && <button type="button" className="icon-button" onClick={() => setQuestion(blankQuestion)}><X size={16} /></button>}</div>
      <div className="admin-form-grid">
        <label className="field-label">Course<select className="competition-input" required value={question.course_id} onChange={(event) => setQuestion({ ...question, course_id: event.target.value, topic_id: '' })}><option value="">Choose course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
        <label className="field-label">Topic<select className="competition-input" value={question.topic_id} onChange={(event) => setQuestion({ ...question, topic_id: event.target.value })}><option value="">Whole course</option>{scopedTopics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}</select></label>
        <label className="field-label admin-span-2">Question<textarea className="competition-input" required minLength={5} maxLength={3000} value={question.prompt} onChange={(event) => setQuestion({ ...question, prompt: event.target.value })} /></label>
        {choiceIds.map((id, index) => <label className="field-label" key={id}><span className="choice-input-title"><input type="radio" name="correct-choice" checked={question.correct_choice_id === id} onChange={() => setQuestion({ ...question, correct_choice_id: id })} /> Correct choice {id.toUpperCase()}</span><input className="competition-input" required maxLength={500} value={question.choices[index]} onChange={(event) => setQuestion({ ...question, choices: question.choices.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })} /></label>)}
        <label className="field-label">Difficulty<select className="competition-input" value={question.difficulty} onChange={(event) => setQuestion({ ...question, difficulty: event.target.value })}><option value="introductory">Introductory</option><option value="standard">Standard</option><option value="advanced">Advanced</option></select></label>
        <label className="field-label">Explanation (optional)<input className="competition-input" value={question.explanation} maxLength={2000} onChange={(event) => setQuestion({ ...question, explanation: event.target.value })} /></label>
      </div>
      <div className="admin-form-actions"><button className="button button-primary" disabled={busy === 'question'}><Save size={15} /> {busy === 'question' ? 'Saving…' : question.id ? 'Save question' : 'Add question'}</button></div>
    </form>

    <form className="admin-panel admin-form" onSubmit={importQuestions}><div className="admin-panel-title"><div><div className="eyebrow">BULK IMPORT</div><h2>Import question JSON</h2></div><FilePlus2 size={18} /></div>
      <p className="empty-copy">Choose a course above, then paste a JSON array with prompt, choices [{`{id,text}`}], correct_choice_id, and optional explanation/difficulty.</p>
      <textarea className="competition-input admin-code-input" rows="7" value={bulkJson} onChange={(event) => setBulkJson(event.target.value)} placeholder={'[{"prompt":"...","choices":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correct_choice_id":"a"}]'} />
      <button className="button button-outline" disabled={busy === 'import' || !question.course_id}><FilePlus2 size={15} /> {busy === 'import' ? 'Importing…' : 'Import questions'}</button>
    </form>

    <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">{questions.length} QUESTIONS</div><h2>Question bank</h2></div></div>
      {loading ? <p className="empty-copy">Loading question bank…</p> : questions.length === 0 ? <p className="empty-copy">Add course questions before scheduling an examination.</p> : <div className="admin-question-list">{questions.map((row) => <article className="admin-question-row" key={row.id}><div><strong>{row.prompt}</strong><small>{courses.find((course) => course.id === row.course_id)?.code || 'Course'} · {topics.find((topic) => topic.id === row.topic_id)?.title || 'Whole course'} · {row.active ? 'Active' : 'Inactive'}</small></div><div className="admin-row-actions"><button className="button button-quiet button-compact" type="button" onClick={() => editQuestion(row)}>Edit</button><button className="icon-button" type="button" aria-label="Delete question" disabled={busy === row.id} onClick={() => deleteQuestion(row)}><Trash2 size={15} /></button></div></article>)}</div>}
    </div>
  </section>;
}
