
import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Building2, Eye, EyeOff,
  GraduationCap, LockKeyhole, Mail, Phone, ShieldCheck,
  UserRound, Layers
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brand, Notice, SupabaseSetupNotice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

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
  const location = useLocation();
  const { configured, refreshAccount, accountError } = useAuth();

  const [form, setForm] = useState({
    fullName: '',
    contact: '',
    password: '',
    university: '',
    department: '',
    academicLevelId: '',
    streamId: '',
    verificationCode: '',
  });

  const [authMethod, setAuthMethod] = useState(location.state?.method || 'email');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function accountContact() {
    if (authMethod === 'email') return form.contact.trim().toLowerCase();
    return normalizeEthiopianMobilePhone(form.contact);
  }

  async function finishSignIn(user) {
    const loadedAccount = await refreshAccount(user);

    if (!loadedAccount) {
      throw new Error(
        'Your account profile could not be loaded. Check your database setup.'
      );
    }

    navigate(isRegister ? '/welcome' : '/dashboard', { replace: true });
  }

  async function verifyPhoneSignup() {
    const phone = accountContact();

    if (!/^\+251[79]\d{8}$/.test(phone)) {
      throw new Error('Enter a valid Ethiopian mobile number beginning with 09 or 07.');
    }

    const token = form.verificationCode.trim();

    if (!/^\d{6}$/.test(token)) {
      throw new Error('Enter the 6-digit code sent to your phone.');
    }

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (verifyError) throw verifyError;

    await finishSignIn(data.user);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!configured || !supabase) return;

    setBusy(true);

    try {
      if (verificationPending) {
        await verifyPhoneSignup();
        return;
      }

      const contact = accountContact();

      if (
        authMethod === 'email' &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
      ) {
        throw new Error('Enter a valid email address.');
      }

      if (
        authMethod === 'phone' &&
        !/^\+251[79]\d{8}$/.test(contact)
      ) {
        throw new Error('Enter an Ethiopian mobile number beginning with 09 or 07.');
      }

      if (isRegister) {
        const university = form.university.trim();
        const department = form.department.trim();

        if (!form.fullName.trim()) {
          throw new Error('Enter your full name.');
        }

        if (!university || university.length > 150) {
          throw new Error('Enter your university (up to 150 characters).');
        }

        if (!department || department.length > 120) {
          throw new Error('Enter your department (up to 120 characters).');
        }

        if (!form.academicLevelId) {
          throw new Error('Select your academic level.');
        }

        if (!form.streamId) {
          throw new Error('Select your stream.');
        }

        const credentials =
          authMethod === 'email'
            ? { email: contact, password: form.password }
            : { phone: contact, password: form.password };

        const { data, error: signUpError } = await supabase.auth.signUp({
          ...credentials,
          options: {
            data: {
              full_name: form.fullName.trim(),
              phone: authMethod === 'phone' ? contact : null,
              university,
              department,
              academic_level_id: Number(form.academicLevelId),
              stream_id: Number(form.streamId),
            },
            ...(authMethod === 'email'
              ? { emailRedirectTo: `${window.location.origin}/welcome` }
              : {}),
          },
        });

        if (signUpError) throw signUpError;

        if (data.session && data.user) {
          await finishSignIn(data.user);
        } else if (authMethod === 'phone') {
          setVerificationPending(true);
          setMessage(
            'Enter the 6-digit code sent by SMS to confirm your number and finish creating your account.'
          );
        } else {
          setMessage(
            'Check your email for a confirmation link. Your BRAVO profile will be ready when you follow it.'
          );
        }
      } else {
        const credentials =
          authMethod === 'email'
            ? { email: contact, password: form.password }
            : { phone: contact, password: form.password };

        const { data, error: loginError } =
          await supabase.auth.signInWithPassword(credentials);

        if (loginError) throw loginError;

        await finishSignIn(data.user);
      }
    } catch (submitError) {
      setError(
        submitError.message || 'We could not complete that request. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  const label = authMethod === 'email' ? 'Email address' : 'Mobile number';

  return (
    <main className="auth-screen">
      <aside className="auth-side-visual">
        <div className="auth-side-glow" />
        <div className="auth-side-content">
          <Brand />
          <div className="auth-quote-mark">✦</div>
          <blockquote>
            Turn the time you spend studying into progress you can see.
          </blockquote>
          <div className="quote-source">
            <span className="quote-rule" /> BRAVO ACADEMY
          </div>
          <div className="auth-side-footer">
            <span><GraduationCap size={15} /> For university freshmen</span>
            <span><ShieldCheck size={15} /> Clear competition rules</span>
          </div>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-mobile-brand"><Brand /></div>

        <Link className="back-link" to="/">
          <ArrowLeft size={16} /> Back to home
        </Link>

        <div className="auth-content">
          <div className="eyebrow">
            {isRegister ? 'YOUR STUDY JOURNEY STARTS HERE' : 'WELCOME BACK'}
          </div>

          <h1>
            {isRegister ? <>Start with<br /><span>your profile.</span></> : <>Good to<br /><span>see you.</span></>}
          </h1>

          <p className="auth-subtitle">
            {isRegister
              ? 'Create a student account for BRAVO Academy.'
              : 'Log in to continue your BRAVO Academy journey.'}
          </p>

          {!configured && <SupabaseSetupNotice />}
          {accountError && <Notice>Account setup needs attention: {accountError}</Notice>}
          {error && <Notice>{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}

          <form className="auth-form" onSubmit={submit}>
            {isRegister && (
              <label className="field-label">
                Full name
                <div className="input-wrap">
                  <UserRound size={17} />
                  <input
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={form.fullName}
                    onChange={(event) => update('fullName', event.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </label>
            )}

            {!verificationPending && (
              <>
                <fieldset className="auth-method-field">
                  <legend className="field-label">Sign in with</legend>
                  <div className="auth-methods">
                    <button
                      type="button"
                      className={`auth-method ${authMethod === 'email' ? 'selected' : ''}`}
                      aria-pressed={authMethod === 'email'}
                      onClick={() => {
                        setAuthMethod('email');
                        setError('');
                        setMessage('');
                      }}
                    >
                      <Mail size={16} /> Email
                    </button>

                    <button
                      type="button"
                      className={`auth-method ${authMethod === 'phone' ? 'selected' : ''}`}
                      aria-pressed={authMethod === 'phone'}
                      onClick={() => {
                        setAuthMethod('phone');
                        setError('');
                        setMessage('');
                      }}
                    >
                      <Phone size={16} /> Phone
                    </button>
                  </div>
                </fieldset>

                <label className="field-label">
                  {label}
                  <div className="input-wrap">
                    {authMethod === 'email' ? <Mail size={17} /> : <Phone size={17} />}
                    <input
                      type={authMethod === 'email' ? 'email' : 'tel'}
                      inputMode={authMethod === 'phone' ? 'tel' : undefined}
                      autoComplete={authMethod === 'email' ? 'email' : 'tel'}
                      required
                      value={form.contact}
                      onChange={(event) => update('contact', event.target.value)}
                      placeholder={
                        authMethod === 'email'
                          ? 'you@example.com'
                          : '0912345678 or +251912345678'
                      }
                    />
                  </div>
                  {authMethod === 'phone' && (
                    <small className="field-hint">
                      Phone sign-in needs a configured SMS provider in Supabase Auth.
                    </small>
                  )}
                </label>
              </>
            )}

            {isRegister && !verificationPending && (
              <div className="student-fields">
                <label className="field-label">
                  University
                  <div className="input-wrap">
                    <Building2 size={17} />
                    <input
                      autoComplete="organization"
                      required
                      maxLength={150}
                      value={form.university}
                      onChange={(event) => update('university', event.target.value)}
                      placeholder="Your university"
                    />
                  </div>
                </label>

                <label className="field-label">
                  Department
                  <div className="input-wrap">
                    <BookOpen size={17} />
                    <input
                      required
                      maxLength={120}
                      value={form.department}
                      onChange={(event) => update('department', event.target.value)}
                      placeholder="Your department"
                    />
                  </div>
                </label>

                <label className="field-label">
                  Academic level
                  <div className="input-wrap">
                    <GraduationCap size={17} />
                    <select
                      required
                      value={form.academicLevelId}
                      onChange={(event) => update('academicLevelId', event.target.value)}
                    >
                      <option value="">Select academic level</option>
                      <option value="1">Grade 12</option>
                      <option value="2">Freshman</option>
                    </select>
                  </div>
                </label>

                <label className="field-label">
                  Stream
                  <div className="input-wrap">
                    <Layers size={17} />
                    <select
                      required
                      value={form.streamId}
                      onChange={(event) => update('streamId', event.target.value)}
                    >
                      <option value="">Select stream</option>
                      <option value="1">Natural</option>
                      <option value="2">Social</option>
                    </select>
                  </div>
                </label>
              </div>
            )}

            {verificationPending && (
              <label className="field-label">
                SMS verification code
                <div className="input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={form.verificationCode}
                    onChange={(event) =>
                      update('verificationCode', event.target.value.replace(/\D/g, ''))
                    }
                    placeholder="6-digit code"
                  />
                </div>
                <small className="field-hint">Sent to {accountContact()}.</small>
              </label>
            )}

            {!verificationPending && (
              <label className="field-label">
                Password
                <div className="input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(event) => update('password', event.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <button
                    className="reveal-button"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}

            {!isRegister && !verificationPending && (
              <Link
                className="forgot-link"
                to="/forgot-password"
                state={{ method: authMethod, contact: form.contact }}
              >
                Forgot password?
              </Link>
            )}

            <button
              className="button button-primary auth-submit"
              disabled={busy || !configured}
              type="submit"
            >
              {busy
                ? 'Please wait…'
                : verificationPending
                  ? 'Verify and create account'
                  : isRegister
                    ? 'Create your account'
                    : 'Log in'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to BRAVO Academy?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>
              {isRegister ? 'Log in' : 'Create an account'}
            </Link>
          </p>

          <p className="auth-legal">
            By continuing, you agree to follow the published competition rules and
            respect the privacy of other students.
          </p>
        </div>
      </div>
    </main>
  );
}
