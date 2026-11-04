import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, Phone } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brand, Notice, SupabaseSetupNotice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

function normalizePhone(value) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^\+251[79]\d{8}$/.test(compact)) return compact;
  if (/^00251[79]\d{8}$/.test(compact)) return `+251${compact.slice(5)}`;
  if (/^0[79]\d{8}$/.test(compact)) return `+251${compact.slice(1)}`;
  return '';
}

export function AccountRecoveryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { configured } = useAuth();
  const [method, setMethod] = useState(location.state?.method || 'email');
  const [contact, setContact] = useState(location.state?.contact || '');
  const [code, setCode] = useState('');
  const [codePending, setCodePending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!configured || !supabase) return;
    setBusy(true);
    try {
      if (codePending) {
        const phone = normalizePhone(contact);
        if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code sent by SMS.');
        const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
        if (verifyError) throw verifyError;
        navigate('/reset-password?source=phone', { replace: true, state: { recovery: true } });
        return;
      }

      if (method === 'email') {
        const email = contact.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage('If an account exists for that email, a password reset link is on its way.');
      } else {
        const phone = normalizePhone(contact);
        if (!phone) throw new Error('Enter an Ethiopian mobile number beginning with 09 or 07.');
        const { error: otpError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        if (otpError) throw otpError;
        setCodePending(true);
        setMessage('Enter the 6-digit code sent by SMS. Confirming this phone lets you choose a new password.');
      }
    } catch (submitError) {
      setError(submitError.message || 'We could not start password recovery. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen recovery-screen">
    <aside className="auth-side-visual"><div className="auth-side-content"><Brand /><div className="auth-quote-mark">✦</div><blockquote>Keep your account secure and under your control.</blockquote><div className="quote-source"><span className="quote-rule" /> ACCOUNT RECOVERY</div></div></aside>
    <div className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><Link className="back-link" to="/login"><ArrowLeft size={16} /> Back to log in</Link><div className="auth-content">
      <div className="eyebrow">ACCOUNT HELP</div><h1>Reset your<br /><span>password.</span></h1><p className="auth-subtitle">Choose the email or verified phone number on your BRAVO account.</p>
      {!configured && <SupabaseSetupNotice />}
      {error && <Notice>{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
      <form className="auth-form" onSubmit={submit}>
        {!codePending && <fieldset className="auth-method-field"><legend className="field-label">Recover with</legend><div className="auth-methods">
          <button type="button" className={`auth-method ${method === 'email' ? 'selected' : ''}`} aria-pressed={method === 'email'} onClick={() => { setMethod('email'); setError(''); setMessage(''); }}><Mail size={16} /> Email</button>
          <button type="button" className={`auth-method ${method === 'phone' ? 'selected' : ''}`} aria-pressed={method === 'phone'} onClick={() => { setMethod('phone'); setError(''); setMessage(''); }}><Phone size={16} /> Phone</button>
        </div></fieldset>}
        {!codePending ? <label className="field-label">{method === 'email' ? 'Email address' : 'Mobile number'}<div className="input-wrap">{method === 'email' ? <Mail size={17} /> : <Phone size={17} />}<input type={method === 'email' ? 'email' : 'tel'} inputMode={method === 'phone' ? 'tel' : undefined} required value={contact} onChange={(event) => setContact(event.target.value)} placeholder={method === 'email' ? 'you@example.com' : '0912345678 or +251912345678'} /></div></label>
          : <label className="field-label">SMS verification code<div className="input-wrap"><LockKeyhole size={17} /><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /></div></label>}
        <button className="button button-primary auth-submit" type="submit" disabled={busy || !configured}>{busy ? 'Please wait…' : codePending ? 'Verify code' : 'Send reset instructions'} {!busy && <ArrowRight size={17} />}</button>
      </form>
      {codePending && <button className="text-button recovery-resend" type="button" disabled={busy} onClick={async () => {
        setError(''); setMessage(''); setBusy(true);
        const phone = normalizePhone(contact);
        const { error: resendError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        setBusy(false);
        if (resendError) setError(resendError.message || 'We could not resend the code.');
        else setMessage('A new code has been sent.');
      }}>Resend code</button>}
    </div></div>
  </main>;
}

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { configured, refreshAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(Boolean(location.state?.recovery || new URLSearchParams(location.search).has('code') || new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery'));
  const [sessionChecked, setSessionChecked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setSessionChecked(true); return undefined; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryReady(true);
      if (session) setSessionChecked(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionChecked(true);
      else setSessionChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!configured || !supabase) return;
    if (!recoveryReady) { setError('Open the password reset link or verify your phone number first.'); return; }
    if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (data.user) await refreshAccount(data.user);
      navigate('/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError.message || 'We could not update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-screen recovery-screen">
    <aside className="auth-side-visual"><div className="auth-side-content"><Brand /><div className="auth-quote-mark">✦</div><blockquote>Choose a new password to return to your learning journey.</blockquote><div className="quote-source"><span className="quote-rule" /> BRAVO ACADEMY</div></div></aside>
    <div className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><Link className="back-link" to="/login"><ArrowLeft size={16} /> Back to log in</Link><div className="auth-content">
      <div className="eyebrow">SECURE YOUR ACCOUNT</div><h1>Choose a new<br /><span>password.</span></h1><p className="auth-subtitle">Use at least 8 characters. You can log in with it after this update.</p>
      {!configured && <SupabaseSetupNotice />}
      {error && <Notice>{error}</Notice>}
      {!recoveryReady && sessionChecked && <Notice>Use the reset link from your email or verify the SMS code first.</Notice>}
      <form className="auth-form" onSubmit={submit}>
        <label className="field-label">New password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /><button className="reveal-button" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label className="field-label">Confirm new password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" /></div></label>
        <button className="button button-primary auth-submit" type="submit" disabled={busy || !configured || !recoveryReady}>{busy ? 'Saving…' : 'Update password'} {!busy && <ArrowRight size={17} />}</button>
      </form>
      <p className="auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p>
    </div></div>
  </main>;
}
