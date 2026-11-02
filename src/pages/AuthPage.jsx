import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice, SupabaseSetupNotice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const levels = [
  { value: 'grade_12', label: 'Grade 12', sub: 'Preparing for university' },
  { value: 'freshman', label: 'University Freshman', sub: 'Building your foundation' },
];
const streams = [
  { value: 'natural_science', label: 'Natural Science' },
  { value: 'social_science', label: 'Social Science' },
];

function normalizeEthiopianMobilePhone(value) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  let nationalNumber = '';

  if (/^\+251[79]\d{8}$/.test(compact)) nationalNumber = compact.slice(4);
  else if (/^00251[79]\d{8}$/.test(compact)) nationalNumber = compact.slice(5);
  else if (/^0[79]\d{8}$/.test(compact)) nationalNumber = compact.slice(1);

  return nationalNumber ? `+251${nationalNumber}` : '';
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const { configured, refreshAccount, accountError } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phoneNumber: '', cbeAccountNumber: '', password: '', academicLevel: '', stream: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!configured || !supabase) return;
    const phoneNumber = isRegister ? normalizeEthiopianMobilePhone(form.phoneNumber) : '';
    if (isRegister && !phoneNumber) {
      setError('Enter a valid Ethiopian mobile number starting with 09 (Ethio telecom) or 07 (Safaricom Ethiopia).');
      return;
    }
    if (isRegister && !/^\d{13}$/.test(form.cbeAccountNumber)) {
      setError('Enter your 13-digit CBE account number.');
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.fullName.trim(), phone_number: phoneNumber, cbe_account_number: form.cbeAccountNumber, academic_level: form.academicLevel, stream: form.stream } },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          const loadedAccount = await refreshAccount(data.user);
          if (!loadedAccount) throw new Error('Your account exists, but its profile could not be loaded. Confirm the database migration is installed.');
          navigate('/dashboard', { replace: true });
        } else {
          setMessage('Your account was created, but email confirmation is still enabled in Supabase. Turn off “Confirm email” under Authentication → Sign In / Providers → Email to log in without a verification email.');
        }
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (loginError) throw loginError;
        const loadedAccount = await refreshAccount(data.user);
        if (!loadedAccount) throw new Error('Your profile could not be loaded. Confirm the database migration is installed.');
        navigate('/dashboard', { replace: true });
      }
    } catch (submitError) {
      setError(submitError.message || 'We could not complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen">
    <div className="auth-side-visual"><div className="auth-side-glow" /><div className="auth-side-content"><Brand /><div className="auth-quote-mark">“</div><blockquote>Great results don't happen by chance. They happen when preparation meets the right challenge.</blockquote><div className="quote-source"><span className="quote-rule" /> THE BR@VO PRINCIPLE</div><div className="auth-side-footer"><span><Check size={14} /> Independent competitions</span><span><Check size={14} /> Score-based rankings</span></div></div></div>
    <div className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to home</Link><div className="auth-content">
      <div className="eyebrow">{isRegister ? 'YOUR STORY STARTS HERE' : 'WELCOME BACK'}</div>
      <h1>{isRegister ? <>Make your<br /><span>mark.</span></> : <>Good to<br /><span>see you.</span></>}</h1>
      <p className="auth-subtitle">{isRegister ? 'Create your profile and find the challenges that fit your ambition.' : 'Log in to continue your BR@VO journey.'}</p>
      {!configured && <SupabaseSetupNotice />}
      {accountError && <Notice>Account setup needs attention: {accountError}</Notice>}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label className="field-label">Full name<div className="input-wrap"><UserRound size={17} /><input autoComplete="name" required maxLength={100} value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Your name" /></div></label>}
        <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" /></div></label>
        {isRegister && <>
          <label className="field-label">Phone number<div className="input-wrap"><Phone size={17} /><input type="tel" inputMode="tel" autoComplete="tel" required value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} placeholder="0912345678 or +251912345678" /></div><small className="field-hint">Use Ethio telecom (09…) or Safaricom Ethiopia (07…).</small></label>
          <label className="field-label">CBE account number<div className="input-wrap"><Building2 size={17} /><input type="text" inputMode="numeric" autoComplete="off" required maxLength={13} pattern="[0-9]{13}" title="Enter the 13-digit CBE account number." value={form.cbeAccountNumber} onChange={(e) => update('cbeAccountNumber', e.target.value.replace(/\D/g, ''))} placeholder="13-digit account number" /></div><small className="field-hint">Enter your 13-digit Commercial Bank of Ethiopia account number.</small></label>
        <fieldset className="choice-field"><legend className="field-label">Academic level</legend><div className="level-options">{levels.map((level) => <button type="button" aria-pressed={form.academicLevel === level.value} className={`level-option ${form.academicLevel === level.value ? 'selected' : ''}`} onClick={() => update('academicLevel', level.value)} key={level.value}><span className="option-radio">{form.academicLevel === level.value && <span />}</span><span><strong>{level.label}</strong><small>{level.sub}</small></span></button>)}</div></fieldset>
          <fieldset className="choice-field"><legend className="field-label">Academic stream</legend><div className="stream-options">{streams.map((stream) => <button type="button" aria-pressed={form.stream === stream.value} className={`stream-option ${form.stream === stream.value ? 'selected' : ''}`} onClick={() => update('stream', stream.value)} key={stream.value}><span className="option-radio">{form.stream === stream.value && <span />}</span>{stream.label}</button>)}</div></fieldset>
        </>}
        <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 8 characters" /><button className="reveal-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <button className="button button-primary auth-submit" disabled={busy || !configured || (isRegister && (!form.academicLevel || !form.stream))} type="submit">{busy ? 'Please wait…' : isRegister ? 'Create your account' : 'Log in'} {!busy && <ArrowRight size={17} />}</button>
      </form>
      <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to BR@VO?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Create an account'}</Link></p>
      <p className="auth-legal">By continuing, you agree to use BR@VO fairly and respect the integrity of every competition.</p>
    </div></div>
  </main>;
}
