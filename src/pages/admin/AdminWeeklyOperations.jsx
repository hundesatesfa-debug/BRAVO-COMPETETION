import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Play } from 'lucide-react';
import { Notice } from '../../components/UI.jsx';
import { supabase } from '../../lib/supabase.js';

const stepInfo = [
  ['settlement', '1 · Previous competition settlement', 'Confirm that results are finalized and the winner ledger was reviewed.'],
  ['payouts', '2 · Manual payouts and reconciliation', 'Record every transfer as paid or failed. Add an explanation for any failed transfer.'],
  ['archive', '3 · Archive previous arena', 'Archive the completed arena while preserving results, payments, and payout history.'],
  ['registration', '4 · Open the next registration', 'Link the next Weekly Arena with registration already open.'],
  ['bravo_cycle', '5 · Start the Bravo cycle', 'Bravo balances are keyed to the server week in Africa/Addis_Ababa; history remains intact.'],
];

export default function AdminWeeklyOperations() {
  const [competitions, setCompetitions] = useState([]);
  const [operations, setOperations] = useState([]);
  const [steps, setSteps] = useState([]);
  const [selectedComp, setSelectedComp] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [nextCompetition, setNextCompetition] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [competitionResult, operationResult] = await Promise.all([
      supabase.from('competitions').select('*').eq('competition_type', 'weekly_arena').order('ends_at', { ascending: false }),
      supabase.from('weekly_operations').select('*').order('created_at', { ascending: false }),
    ]);
    if (competitionResult.error || operationResult.error) setError(competitionResult.error?.message || operationResult.error?.message);
    setCompetitions(competitionResult.data || []); setOperations(operationResult.data || []);
    const chosen = selectedOperation || operationResult.data?.[0]?.id || '';
    setSelectedOperation(chosen);
    if (chosen) {
      const { data, error: stepError } = await supabase.from('weekly_operation_steps').select('*').eq('operation_id', chosen).order('step_order');
      if (stepError) setError(stepError.message);
      setSteps(data || []);
    } else setSteps([]);
    setLoading(false);
  }, [selectedOperation]);
  useEffect(() => { load(); }, [load]);

  async function startOperation() {
    setBusy('start'); setError(''); setSuccess('');
    const { data, error: rpcError } = await supabase.rpc('admin_open_weekly_operation', { p_competition_id: selectedComp });
    if (rpcError) setError(rpcError.message); else { setSelectedOperation(data); setSuccess('Sunday Operations opened.'); await load(); }
    setBusy('');
  }

  async function complete(stepKey) {
    setBusy(stepKey); setError(''); setSuccess('');
    const { error: rpcError } = await supabase.rpc('admin_complete_weekly_operation_step', {
      p_operation_id: selectedOperation,
      p_step_key: stepKey,
      p_notes: notes || null,
      p_linked_competition_id: stepKey === 'registration' ? nextCompetition || null : null,
    });
    if (rpcError) setError(rpcError.message); else { setSuccess('Workflow step confirmed.'); setNotes(''); await load(); }
    setBusy('');
  }

  const operation = operations.find((row) => row.id === selectedOperation);
  const competition = competitions.find((row) => row.id === operation?.competition_id);
  const openUpcoming = competitions.filter((row) => row.status === 'registration_open' && (!competition || new Date(row.starts_at) > new Date(competition.ends_at)));
  return <section className="admin-section">
    <div className="dashboard-section-heading"><div><div className="eyebrow">WEEKLY CYCLE</div><h1>Sunday Operations</h1></div><ClipboardCheck size={20} /></div>
    {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">OPEN WORKFLOW</div><h2>Start from a completed Weekly Arena</h2></div></div>
      <div className="admin-inline-controls"><select className="competition-input" value={selectedComp} onChange={(event) => setSelectedComp(event.target.value)}><option value="">Choose completed arena</option>{competitions.filter((row) => ['completed', 'archived'].includes(row.status)).map((row) => <option value={row.id} key={row.id}>{row.title}</option>)}</select><button className="button button-primary" onClick={startOperation} disabled={!selectedComp || busy === 'start'}><Play size={15} /> {busy === 'start' ? 'Opening…' : 'Open weekly workflow'}</button></div>
      {operations.length > 1 && <label className="field-label operation-select">Workflow history<select className="competition-input" value={selectedOperation} onChange={(event) => setSelectedOperation(event.target.value)}>{operations.map((row) => <option value={row.id} key={row.id}>{competitions.find((comp) => comp.id === row.competition_id)?.title || 'Weekly Arena'} · {row.status}</option>)}</select></label>}
    </div>
    {loading ? <div className="competition-empty"><span className="loading-inline" /> Loading weekly operations…</div> : operation ? <div className="admin-panel"><div className="admin-panel-title"><div><div className="eyebrow">{competition?.title || 'WEEKLY ARENA'}</div><h2>{operation.status === 'complete' ? 'Cycle complete' : 'Review each step in order'}</h2></div><span className={`status-pill status-${operation.status}`}>{operation.status}</span></div>
      <div className="weekly-step-list">{stepInfo.map(([key, title, description]) => {
        const step = steps.find((row) => row.step_key === key);
        const pending = !step || step.status !== 'complete';
        const unlocked = pending && steps.filter((row) => row.step_order < (step?.step_order || 1)).every((row) => row.status === 'complete');
        return <article className={`weekly-step${pending ? ' weekly-step-pending' : ' weekly-step-done'}`} key={key}>
          <span className="weekly-step-icon">{pending ? <span>{step?.step_order || 1}</span> : <CheckCircle2 size={18} />}</span>
          <div className="weekly-step-copy"><h3>{title}</h3><p>{description}</p>{step?.notes && <small>Admin note: {step.notes}</small>}</div>
          {pending && unlocked && <div className="weekly-step-actions">
            {key === 'registration' && <select className="competition-input" value={nextCompetition} onChange={(event) => setNextCompetition(event.target.value)}><option value="">Choose next arena</option>{openUpcoming.map((row) => <option value={row.id} key={row.id}>{row.title}</option>)}</select>}
            {(key === 'payouts' || key === 'settlement') && <input className="competition-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={key === 'payouts' ? 'Reconciliation note (if any failures)' : 'Settlement note (optional)'} />}
            <button className="button button-outline button-compact" disabled={busy === key || (key === 'registration' && !nextCompetition)} onClick={() => complete(key)}>Confirm step</button>
          </div>}
        </article>;
      })}</div>
      {competition && <p className="operational-disclaimer">Bravo points do not need to be erased. The wallet selects the current Addis Ababa week from server time and retains previous cycles.</p>}
    </div> : <div className="competition-empty"><ClipboardCheck size={22} /><h3>No Sunday workflow opened</h3><p>Choose a completed Weekly Arena to begin the settlement checklist.</p></div>}
  </section>;
}
