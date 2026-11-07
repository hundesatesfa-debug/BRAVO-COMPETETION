import { useCallback, useEffect, useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const keys = ['telebirr_instructions', 'cbe_birr_instructions', 'support_email', 'support_phone', 'terms_url', 'privacy_url', 'minimum_weekly_participants'];
const labels = {
  telebirr_instructions: 'Telebirr payment instructions', cbe_birr_instructions: 'CBE Birr payment instructions',
  support_email: 'Support email', support_phone: 'Support phone', terms_url: 'Terms and conditions URL',
  privacy_url: 'Privacy policy URL', minimum_weekly_participants: 'Minimum Weekly Arena participants',
};

export default function AdminSettings() {
  const [values, setValues] = useState(Object.fromEntries(keys.map((key) => [key, key === 'minimum_weekly_participants' ? '1' : ''])));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('system_settings').select('key,value').in('key', keys);
    if (loadError) setError(loadError.message);
    const merged = { ...values };
    for (const row of data || []) merged[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '');
    setValues(merged); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    const { error: saveError } = await supabase.rpc('admin_update_system_settings', { p_settings: values });
    if (saveError) setError(saveError.message); else setSuccess('Platform settings saved.');
    setBusy(false);
  }

  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">PLATFORM CONFIGURATION</div><h1>System settings</h1></div><Settings2 size={20} /></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading platform settings…</div> : <form className="admin-panel admin-form" onSubmit={save}>
      <div className="admin-panel-title"><div><div className="eyebrow">MANUAL PAYMENT & CONTACT DETAILS</div><h2>Student-facing information</h2></div></div>
      <p className="empty-copy">These fields are shown to signed-in students. Do not enter passwords, merchant API credentials, or other secrets.</p>
      <div className="admin-form-grid">{keys.map((key) => <label className={`field-label${key.endsWith('_instructions') ? ' admin-span-2' : ''}`} key={key}>{labels[key]}
        {key.endsWith('_instructions') ? <textarea className="competition-input" rows="3" maxLength={1000} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} placeholder="Account display name, payment account, and transfer instructions" />
          : <input className="competition-input" type={key.endsWith('_url') ? 'url' : key === 'minimum_weekly_participants' ? 'number' : 'text'} min={key === 'minimum_weekly_participants' ? 1 : undefined} max={key === 'minimum_weekly_participants' ? 100 : undefined} maxLength={key.endsWith('_url') ? undefined : 200} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />}
      </label>)}</div>
      <div className="admin-form-actions"><button className="button button-primary" disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>}
  </section>;
}
