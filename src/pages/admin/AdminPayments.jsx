import { useCallback, useEffect, useState } from 'react';
import { Check, FileCheck2, Image, RotateCcw, X } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

function money(value) { return `ETB ${Number(value).toFixed(2)}`; }
function stamp(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminPayments({ refunds = false }) {
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [competitions, setCompetitions] = useState({});
  const [receiptUrls, setReceiptUrls] = useState({});
  const [filter, setFilter] = useState(refunds ? 'requested' : 'pending');
  const [notes, setNotes] = useState({});
  const [references, setReferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const result = refunds
      ? await supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(300)
      : await supabase.from('payments').select('*').order('submitted_at', { ascending: false }).limit(300);
    if (result.error) { setError(result.error.message); setRows([]); setLoading(false); return; }
    const source = result.data || [];
    setRows(source);
    const userIds = [...new Set(source.map((row) => row.user_id))];
    const compIds = [...new Set(source.map((row) => row.competition_id))];
    const rowIds = refunds ? [] : source.map((row) => row.id);
    const [profileResult, compResult, receiptResult] = await Promise.all([
      userIds.length ? supabase.from('profiles').select('id, full_name, phone_number').in('id', userIds) : Promise.resolve({ data: [], error: null }),
      compIds.length ? supabase.from('competitions').select('id, title, competition_type, entry_fee_etb').in('id', compIds) : Promise.resolve({ data: [], error: null }),
      rowIds.length ? supabase.from('payment_receipts').select('payment_id, object_path, mime_type').in('payment_id', rowIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileResult.error || compResult.error || receiptResult.error) setError(profileResult.error?.message || compResult.error?.message || receiptResult.error?.message || 'Related payment records could not be loaded.');
    setProfiles(Object.fromEntries((profileResult.data || []).map((row) => [row.id, row])));
    setCompetitions(Object.fromEntries((compResult.data || []).map((row) => [row.id, row])));
    const signed = {};
    for (const receipt of receiptResult.data || []) {
      const { data } = await supabase.storage.from('payment-receipts').createSignedUrl(receipt.object_path, 300);
      if (data?.signedUrl) signed[receipt.payment_id] = { ...receipt, url: data.signedUrl };
    }
    setReceiptUrls(signed);
    setLoading(false);
  }, [refunds]);
  useEffect(() => { load(); }, [load]);

  async function reviewPayment(row, decision) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: reviewError } = await supabase.rpc('admin_review_competition_payment', { p_payment_id: row.id, p_decision: decision, p_note: notes[row.id] || null });
    if (reviewError) setError(reviewError.message); else { setSuccess(`Payment ${decision}.`); await load(); }
    setBusy('');
  }

  async function updateRefund(row, status) {
    setBusy(row.id); setError(''); setSuccess('');
    const { error: refundError } = await supabase.rpc('admin_update_refund', {
      p_refund_id: row.id, p_status: status, p_reference: references[row.id] || null, p_note: notes[row.id] || null,
    });
    if (refundError) setError(refundError.message); else { setSuccess(`Refund marked ${status}.`); await load(); }
    setBusy('');
  }

  const filtered = rows.filter((row) => row.status === filter || filter === 'all');
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">{refunds ? 'REFUND WORKFLOW' : 'MANUAL VERIFICATION'}</div><h1>{refunds ? 'Refunds' : 'Payment review'}</h1></div>
      <select className="admin-filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>{(refunds ? ['requested', 'processing', 'refunded', 'failed', 'all'] : ['pending', 'verified', 'rejected', 'refund_pending', 'refunded', 'all']).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
    </div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading records…</div> : filtered.length === 0 ? <div className="competition-empty">{refunds ? <RotateCcw size={22} /> : <FileCheck2 size={22} />}<h3>No {filter === 'all' ? '' : `${filter.replaceAll('_', ' ')} `}{refunds ? 'refunds' : 'payments'}</h3><p>{refunds ? 'Cancelled verified entries are added to the refund queue.' : 'Student submissions will appear here for manual bank verification.'}</p></div> : <div className="admin-payment-list">{filtered.map((row) => {
      const person = profiles[row.user_id]; const competition = competitions[row.competition_id]; const receipt = receiptUrls[row.id];
      return <article className="admin-payment-card" key={row.id}>
        <div className="admin-payment-top"><div><span className={`status-pill status-${row.status}`}>{row.status.replaceAll('_', ' ')}</span><h2>{competition?.title || 'Competition'}</h2><p>{person?.full_name || 'Student'} · {person?.phone_number || 'No phone on profile'}</p></div><strong>{money(row.amount_etb)}</strong></div>
        {!refunds && <div className="admin-payment-detail-grid"><span>Method<strong>{row.method === 'cbe_birr' ? 'CBE Birr' : 'Telebirr'}</strong></span><span>Reference<strong>{row.transaction_reference}</strong></span><span>Submitted<strong>{stamp(row.submitted_at)}</strong></span><span>Receipt{receipt ? <a href={receipt.url} target="_blank" rel="noreferrer" className="receipt-link"><Image size={15} /> Open secure file</a> : <strong>Not available</strong>}</span></div>}
        {refunds && <div className="admin-payment-detail-grid"><span>Refund requested<strong>{stamp(row.requested_at)}</strong></span><span>External reference<strong>{row.external_reference || 'Not paid'}</strong></span><span>Note<strong>{row.note || '—'}</strong></span></div>}
        {!['verified', 'rejected', 'refunded'].includes(row.status) && <label className="field-label admin-note-field">{refunds ? 'Refund note' : 'Review note'}<input className="competition-input" value={notes[row.id] ?? row.review_note ?? row.note ?? ''} onChange={(event) => setNotes((state) => ({ ...state, [row.id]: event.target.value }))} maxLength={500} placeholder="Optional note for the student" /></label>}
        {refunds && row.status !== 'refunded' && <div className="admin-row-actions">
          {['requested', 'failed'].includes(row.status) && <button className="button button-outline button-compact" disabled={busy === row.id} onClick={() => updateRefund(row, 'processing')}>{row.status === 'failed' ? 'Retry refund' : 'Start refund'}</button>}
          <label className="field-label refund-reference">External refund reference<input className="competition-input" value={references[row.id] || ''} onChange={(event) => setReferences((state) => ({ ...state, [row.id]: event.target.value }))} maxLength={120} placeholder="Required to mark paid" /></label>
          <button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => updateRefund(row, 'refunded')}><Check size={14} /> Mark refunded</button>
          {row.status !== 'failed' && <button className="button button-danger button-compact" disabled={busy === row.id} onClick={() => updateRefund(row, 'failed')}><X size={14} /> Mark failed</button>}
        </div>}
        {!refunds && row.status === 'pending' && <div className="admin-row-actions"><button className="button button-primary button-compact" disabled={busy === row.id} onClick={() => reviewPayment(row, 'verified')}><Check size={14} /> Verify payment</button><button className="button button-danger button-compact" disabled={busy === row.id} onClick={() => reviewPayment(row, 'rejected')}><X size={14} /> Reject payment</button></div>}
        {row.review_note && !refunds && <p className="admin-review-note">Review note: {row.review_note}</p>}
      </article>;
    })}</div>}
  </section>;
}
