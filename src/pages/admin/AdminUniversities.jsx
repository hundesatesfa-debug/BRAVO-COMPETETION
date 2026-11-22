
import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const emptyForm = { name: '', code: '' };

export default function AdminUniversities() {
  const [universities, setUniversities] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUniversities = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: loadError } = await supabase
      .from('universities')
      .select('*')
      .order('name');

    if (loadError) setError(loadError.message);
    else setUniversities(data || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadUniversities();
  }, [loadUniversities]);

  function startEdit(university) {
    setEditingId(university.id);
    setForm({
      name: university.name || '',
      code: university.code || '',
    });
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveUniversity(event) {
    event.preventDefault();
    if (!supabase) return;

    setBusy('save');
    setError('');
    setSuccess('');

    const name = form.name.trim();
    const code = form.code.trim().toUpperCase() || null;

    if (name.length < 2 || name.length > 150) {
      setError('University name must contain 2 to 150 characters.');
      setBusy('');
      return;
    }

    const payload = { name, code };

    const result = editingId
      ? await supabase.from('universities').update(payload).eq('id', editingId)
      : await supabase.from('universities').insert(payload);

    if (result.error) {
      setError(
        result.error.code === '23505'
          ? 'A university with this name or code already exists.'
          : result.error.message
      );
    } else {
      setSuccess(editingId ? 'University updated.' : 'University added.');
      resetForm();
      await loadUniversities();
    }

    setBusy('');
  }

  async function toggleActive(university) {
    if (!supabase) return;

    setBusy(university.id);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('universities')
      .update({ active: !university.active })
      .eq('id', university.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(
        university.active
          ? 'University deactivated.'
          : 'University activated.'
      );
      await loadUniversities();
    }

    setBusy('');
  }

  async function deleteUniversity(university) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Delete "${university.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setBusy(university.id);
    setError('');
    setSuccess('');

    const { count, error: countError } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('university_id', university.id);

    if (countError) {
      setError(countError.message);
      setBusy('');
      return;
    }

    if (count > 0) {
      setError(
        `Cannot delete ${university.name}: ${count} course(s) are assigned to it. Deactivate it instead.`
      );
      setBusy('');
      return;
    }

    const { error: deleteError } = await supabase
      .from('universities')
      .delete()
      .eq('id', university.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSuccess('University deleted.');
      if (editingId === university.id) resetForm();
      await loadUniversities();
    }

    setBusy('');
  }

  return (
    <section className="admin-section">
      <div className="dashboard-section-heading">
        <div>
          <div className="eyebrow">ACADEMIC STRUCTURE</div>
          <h1>University Management</h1>
        </div>

        <button
          type="button"
          className="button button-outline"
          onClick={loadUniversities}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <Notice>{error}</Notice>}
      {success && <Notice>{success}</Notice>}

      <div className="admin-two-column">
        <form className="admin-panel admin-form" onSubmit={saveUniversity}>
          <div className="admin-panel-title">
            <div>
              <div className="eyebrow">
                {editingId ? 'EDIT UNIVERSITY' : 'NEW UNIVERSITY'}
              </div>
              <h2>{editingId ? 'Update university' : 'Add university'}</h2>
            </div>
            <Building2 size={19} />
          </div>

          <label className="field-label">
            University name
            <input
              className="competition-input"
              required
              minLength={2}
              maxLength={150}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="e.g. Haramaya University"
            />
          </label>

          <label className="field-label">
            University code (optional)
            <input
              className="competition-input"
              maxLength={30}
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
              placeholder="e.g. HU"
            />
          </label>

          <div className="admin-form-actions">
            <button
              className="button button-primary"
              disabled={busy === 'save'}
            >
              <Save size={15} />
              {busy === 'save'
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Add university'}
            </button>

            {editingId && (
              <button
                type="button"
                className="button button-quiet"
                onClick={resetForm}
              >
                <X size={15} /> Cancel
              </button>
            )}
          </div>
        </form>

        <div className="admin-panel">
          <div className="admin-panel-title">
            <div>
              <div className="eyebrow">
                {universities.length} UNIVERSITIES
              </div>
              <h2>Registered universities</h2>
            </div>
          </div>

          {loading ? (
            <p className="empty-copy">Loading universities…</p>
          ) : universities.length === 0 ? (
            <p className="empty-copy">
              No universities added yet. Add your first university.
            </p>
          ) : (
            <div className="admin-question-list">
              {universities.map((university) => (
                <article className="admin-question-row" key={university.id}>
                  <div className="admin-material-label">
                    <Building2 size={17} />
                    <span>
                      <strong>{university.name}</strong>
                      <small>
                        {university.code || 'No code'} ·{' '}
                        {university.active ? 'Active' : 'Inactive'}
                      </small>
                    </span>
                  </div>

                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="button button-quiet button-compact"
                      onClick={() => startEdit(university)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="button button-quiet button-compact"
                      disabled={busy === university.id}
                      onClick={() => toggleActive(university)}
                    >
                      {university.active ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${university.name}`}
                      disabled={busy === university.id}
                      onClick={() => deleteUniversity(university)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
