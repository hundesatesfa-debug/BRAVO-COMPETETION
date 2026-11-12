import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, CreditCard, FileCheck2, Link2, Trophy, UploadCloud, UsersRound } from 'lucide-react';
import { Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { normalizeCompetitionFeed } from '../lib/competitionFeed.js';

const typeLabels = {
  weekly_arena: 'Weekly Micro-Arena',
  grand_milestone: 'Grand Milestone Competition',
};

const statusLabels = {
  draft: 'Draft',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  active: 'In progress',
  completed: 'Results published',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

const registrationLabels = {
  awaiting_payment: 'Place reserved · payment needed',
  payment_pending: 'Payment under review',
  eligible: 'Registration confirmed',
  rejected: 'Payment needs correction',
  refund_pending: 'Refund processing',
  refunded: 'Refund recorded',
  withdrawn: 'Registration withdrawn',
};

function formatDate(value) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function settingText(value) {
  if (typeof value === 'string') return value;
  return value == null ? '' : String(value);
}

export default function CompetitionPage() {
  const { account } = useAuth();
  const [competitions, setCompetitions] = useState([]);
  const [instructions, setInstructions] = useState({});
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('telebirr');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [feedResult, settingsResult, paymentsResult] = await Promise.all([
      supabase.rpc('get_competition_feed'),
      supabase.from('system_settings').select('key, value').in('key', ['telebirr_instructions', 'cbe_birr_instructions']),
      supabase.from('payments').select('id, registration_id, method, amount_etb, transaction_reference, status, review_note, submitted_at')
        .eq('user_id', account.user.id).order('submitted_at', { ascending: true }),
    ]);
    const firstError = feedResult.error || settingsResult.error || paymentsResult.error;
    if (firstError) setError(firstError.message || 'Competition information could not be loaded.');
    setCompetitions(normalizeCompetitionFeed(feedResult.data));
    setInstructions(Object.fromEntries((settingsResult.data || []).map((row) => [row.key, settingText(row.value)])));
    setPayments(Object.fromEntries((paymentsResult.data || []).map((row) => [row.registration_id, row])));
    setLoading(false);
  }, [account.user.id]);

  useEffect(() => { load(); }, [load]);

  const profile = account?.profile;
  const visibleCompetitions = useMemo(() => competitions.filter((competition) => {
    if (!competition.academic_level && !competition.stream) return true;
    const levelValue = profile?.academic_level === 'Grade 12' ? 'grade_12' : profile?.academic_level === 'University Freshman' ? 'freshman' : '';
    const streamValue = profile?.stream === 'Natural Science' ? 'natural_science' : profile?.stream === 'Social Science' ? 'social_science' : '';
    const levelMatches = !competition.academic_level || competition.academic_level === levelValue;
    const streamMatches = !competition.stream || competition.stream === streamValue;
    return levelMatches && streamMatches;
  }), [competitions, profile]);

  async function register(competition) {
    setBusyId(competition.id); setError(''); setSuccess('');
    const { error: rpcError } = await supabase.rpc('register_for_competition', { p_competition_id: competition.id });
    if (rpcError) setError(rpcError.message);
    else { setSuccess('Your place is reserved. Submit your payment receipt to confirm enrollment.'); await load(); }
    setBusyId('');
  }

  async function withdraw(registrationId) {
    setBusyId(registrationId); setError(''); setSuccess('');
    const { error: rpcError } = await supabase.rpc('withdraw_competition_registration', { p_registration_id: registrationId });
    if (rpcError) setError(rpcError.message);
    else { setSuccess('Your unpaid registration was withdrawn.'); await load(); }
    setBusyId('');
  }

  async function requestRefund(registrationId) {
    setBusyId(registrationId); setError(''); setSuccess('');
    const { error: rpcError } = await supabase.rpc('request_competition_refund', { p_registration_id: registrationId });
    if (rpcError) setError(rpcError.message);
    else { setSuccess('Your refund request was recorded.'); await load(); }
    setBusyId('');
  }

  async function submitPayment(event, competition) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const method = String(form.get('method') || '');
    const reference = String(form.get('reference') || '').trim();
    const file = form.get('receipt');
    const registrationId = competition.registration_id;
    if (!(file instanceof File) || file.size < 1) { setError('Choose your receipt image or PDF.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Receipt files must be 5 MB or smaller.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) { setError('Choose a JPG, PNG, WEBP, or PDF receipt.'); return; }
    setBusyId(registrationId); setError(''); setSuccess('');
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'receipt';
    const path = `${account.user.id}/${registrationId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('payment-receipts').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) {
      setError(uploadError.message);
      setBusyId('');
      return;
    }
    const { error: submitError } = await supabase.rpc('submit_competition_payment', {
      p_registration_id: registrationId,
      p_method: method,
      p_transaction_reference: reference,
      p_receipt_path: path,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });
    if (submitError) {
      await supabase.storage.from('payment-receipts').remove([path]);
      setError(submitError.message);
    } else {
      setSuccess('Receipt submitted. Your place becomes eligible after an administrator verifies the payment.');
      await load();
    }
    setBusyId('');
  }

  return (
    <section className="competition-workspace operational-page" aria-labelledby="competitions-title">
      <div className="competition-heading">
        <div>
          <div className="eyebrow">COMPETITION SEASON</div>
          <h1 id="competitions-title">Find your next challenge</h1>
          <p>Weekly Arenas and Grand Competitions have separate payments, exams, rankings, and prize records.</p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}
      {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading competitions…</div> : visibleCompetitions.length === 0 ? (
        <div className="competition-empty"><Trophy size={22} /><h3>No competitions are published yet</h3><p>When registration opens, its fee, dates, and prize rules will appear here.</p></div>
      ) : (
        <div className="competition-list">
          {visibleCompetitions.map((competition) => {
            const registrationStatus = competition.registration_status;
            const payment = payments[competition.registration_id];
            const open = competition.status === 'registration_open' && new Date(competition.registration_opens_at) <= new Date() && new Date(competition.registration_deadline) > new Date();
            const full = competition.participant_limit != null
              && competition.reserved_count != null
              && Number(competition.reserved_count) >= Number(competition.participant_limit);
            const needsPayment = registrationStatus === 'awaiting_payment';
            return (
              <article className="competition-card" key={competition.id}>
                <div className="competition-card-top">
                  <span className={`competition-status status-${competition.status}`}>{statusLabels[competition.status] || competition.status}</span>
                  <span className="competition-target">{typeLabels[competition.competition_type]}</span>
                </div>
                <h2>{competition.title}</h2>
                <p className="competition-description">{competition.description}</p>
                <div className="competition-stats">
                  <div className="competition-stat"><span>Entry fee</span><strong>ETB {Number(competition.entry_fee_etb).toFixed(0)}</strong></div>
                  {competition.eligible_count != null && <div className="competition-stat"><span>Verified participants</span><strong>{competition.eligible_count}{competition.participant_limit ? ` / ${competition.participant_limit}` : ''}</strong></div>}
                  <div className="competition-stat"><span>Reward pool share</span><strong>{competition.reward_share_pct}%</strong></div>
                </div>
                <div className="competition-dates">
                  <span><Clock3 size={15} /> Starts {formatDate(competition.starts_at)}</span>
                  <span><Clock3 size={15} /> Register by {formatDate(competition.registration_deadline)}</span>
                  <span><UsersRound size={15} /> Top {competition.winner_percent}% share the prize pool</span>
                </div>

                {registrationStatus ? (
                  <div className="operational-status-row">
                    <strong className={`status-pill status-${registrationStatus}`}>{registrationLabels[registrationStatus] || registrationStatus}</strong>
                    {payment && <span>{payment.method === 'cbe_birr' ? 'CBE Birr' : 'Telebirr'} · {payment.status} · {payment.transaction_reference}</span>}
                    {registrationStatus === 'awaiting_payment' && open && (
                      <button type="button" className="button button-quiet button-compact" onClick={() => withdraw(competition.registration_id)} disabled={busyId === competition.registration_id}>
                        {busyId === competition.registration_id ? 'Updating…' : 'Withdraw place'}
                      </button>
                    )}
                    {registrationStatus === 'refund_pending' && competition.status === 'cancelled' && (
                      <button type="button" className="button button-quiet button-compact" onClick={() => requestRefund(competition.registration_id)} disabled={busyId === competition.registration_id}>
                        Request refund
                      </button>
                    )}
                  </div>
                ) : open ? (
                  <div className="competition-card-footer">
                    <span>{full ? 'All reserved seats are currently taken.' : 'Verified payment is required before you can take the examination.'}</span>
                    <button type="button" className="button button-primary" onClick={() => register(competition)} disabled={full || busyId === competition.id}>
                      {busyId === competition.id ? 'Reserving…' : 'Reserve my place'}
                    </button>
                  </div>
                ) : <div className="competition-card-footer"><span>Registration is not currently open.</span></div>}

                {needsPayment && open && (
                  <form className="operational-form" onSubmit={(event) => submitPayment(event, competition)}>
                    <div className="operational-form-heading"><CreditCard size={18} /><div><strong>Pay {Number(competition.entry_fee_etb).toFixed(0)} ETB</strong><span>Submit the proof after transferring through the active account below.</span></div></div>

                    <div className="competition-form-grid" style={{ display: 'grid', gap: '18px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        {instructions.telebirr_instructions && (
                          <button type="button" className={`button ${selectedMethod === 'telebirr' ? 'button-primary' : 'button-quiet'}`} style={{ justifyContent: 'center', minHeight: 52 }} onClick={() => setSelectedMethod('telebirr')}>
                            <span style={{ marginRight: 8 }}>📱</span> Telebirr
                          </button>
                        )}
                        {instructions.cbe_birr_instructions && (
                          <button type="button" className={`button ${selectedMethod === 'cbe_birr' ? 'button-primary' : 'button-quiet'}`} style={{ justifyContent: 'center', minHeight: 52 }} onClick={() => setSelectedMethod('cbe_birr')}>
                            <span style={{ marginRight: 8 }}>🏦</span> CBE / Bank
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                        <div className="payment-instruction-box" style={{ padding: '18px 16px' }}>
                          <div style={{ color: '#a7b1c0', fontSize: 12, marginBottom: 8 }}>Account name</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#f5f7fb' }}>
                            {selectedMethod === 'cbe_birr' ? 'Atenaf' : 'Atenaf'}
                          </div>
                        </div>

                        <div className="payment-instruction-box" style={{ padding: '18px 16px' }}>
                          <div style={{ color: '#a7b1c0', fontSize: 12, marginBottom: 8 }}>{selectedMethod === 'cbe_birr' ? 'CBE account number' : 'Telebirr number'}</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#ff8a3d' }}>
                            {selectedMethod === 'cbe_birr' ? '1000516132837' : '0900000000'}
                          </div>
                        </div>
                      </div>

                      <div className="payment-instruction-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 16px' }}>
                        <span style={{ color: '#b7c2d0' }}>Exact amount to transfer:</span>
                        <strong style={{ fontSize: 28, color: '#f5f7fb' }}>{Number(competition.entry_fee_etb).toFixed(0)} ETB</strong>
                      </div>

                      <div style={{ display: 'grid', gap: 10, color: '#dfe6f2' }}>
                        <div>1. Transfer exactly {Number(competition.entry_fee_etb).toFixed(0)} ETB to the account above.</div>
                        <div>2. Copy the official receipt link from the confirmation SMS.</div>
                        <div>3. Paste the receipt link below and click Verify payment.</div>
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Link2 size={16} /> Receipt link
                        </label>
                        <input className="competition-input" name="reference" required minLength={3} maxLength={220} autoComplete="off" placeholder="https://mreceipt.cbe.com.et/..." />
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <label className="field-label">Payment proof
                          <input className="competition-input" name="receipt" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
                        </label>
                      </div>

                      <input type="hidden" name="method" value={selectedMethod} />
                    </div>

                    <div className="competition-form-actions"><button className="button button-primary" type="submit" disabled={busyId === competition.registration_id}>
                      <UploadCloud size={15} /> {busyId === competition.registration_id ? 'Submitting…' : 'Verify payment & activate'}
                    </button></div>
                  </form>
                )}
                {registrationStatus === 'eligible' && <div className="payment-confirmed"><Check size={16} /> Verified entry. Check Examinations for your scheduled assessment.</div>}
                {payment?.status === 'rejected' && <div className="payment-confirmed payment-needs-review"><FileCheck2 size={16} />{payment?.review_note || 'Review the payment note and submit corrected payment details.'}</div>}
              </article>
            );
          })}
        </div>
      )}
      <p className="operational-disclaimer">Bravos are learning points, not money. Prize amounts are based on verified entries and the competition rules shown above.</p>
    </section>
  );
}
