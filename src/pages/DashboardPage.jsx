
import { lazy, Suspense, useState } from 'react';
import {
  Bell, BookOpen, CalendarDays, ChevronDown, Command, CreditCard, GraduationCap, Layers, LibraryBig,
  LogOut, Mail, Phone, ShieldCheck, Trophy, UserRound, WalletCards
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import BravoWalletPage from './BravoWalletPage.jsx';
import StudentOverview from './StudentOverview.jsx';
import CompetitionPage from './CompetitionPage.jsx';
import ExamPage from './ExamPage.jsx';
import StudentResultsPage from './StudentResultsPage.jsx';
import NotificationsPage from './NotificationsPage.jsx';

const StudyRoomPage = lazy(() => import('./StudyRoomPage.jsx'));

const workspaceLinks = [
  { to: '/dashboard', label: 'Overview', icon: Command, end: true },
  { to: '/study-room', label: 'Study Room', icon: BookOpen },
  { to: '/materials', label: 'My Materials', icon: LibraryBig },
  { to: '/bravos', label: 'Bravo Wallet', icon: WalletCards },
  { to: '/competitions', label: 'Competitions', icon: Trophy },
  { to: '/exams', label: 'Examinations', icon: CalendarDays },
  { to: '/leaderboard', label: 'Leaderboard', icon: GraduationCap },
  { to: '/rewards', label: 'Rewards', icon: CreditCard },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

export default function DashboardPage() {
  const { account, signOut, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverview = location.pathname === '/dashboard';
  const activeTitle = workspaceLinks.find((item) => item.to === location.pathname)?.label || 'Overview';

  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(account?.profile.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const firstName = (
    account?.profile.full_name ||
    account?.user.email ||
    account?.user.phone ||
    'Learner'
  ).split(' ')[0];

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() })
      .eq('id', account.user.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      try {
        await refreshAccount(account.user);
        setSuccess('Your profile is updated.');
      } catch (refreshError) {
        setError(`Your name was saved, but the account profile could not be refreshed: ${refreshError.message}`);
      }
    }

    setSaving(false);
  }

  async function logout() {
    setSigningOut(true);

    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (logoutError) {
      setError(logoutError.message);
      setSigningOut(false);
    }
  }

  function toggleProfile() {
    setProfileOpen((open) => !open);
    setError('');
    setSuccess('');
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          {workspaceLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`} to={to} end={end}>
              <Icon size={17} />
              {label}
              <span className="nav-active-mark" />
            </NavLink>
          ))}
          {account?.role === 'admin' && <NavLink className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`} to="/admin/overview"><ShieldCheck size={17} />Admin console<span className="nav-active-mark" /></NavLink>}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="help-icon"><ShieldCheck size={17} /></div>
            <strong>Compete with confidence</strong>
            <p>Your official results are always tied to your examination score.</p>
          </div>

          <button
            className="sidebar-signout"
            onClick={logout}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="breadcrumb">
            <span>BRAVO Academy</span>
            <span className="crumb-slash">/</span>
            <strong>{activeTitle}</strong>
          </div>

          <div className="topbar-right">
            <span className="account-role">
              <span className="role-dot" />
              {account?.role === 'admin' ? 'Administrator' : 'Student'}
            </span>

            <button
              className="account-chip"
              onClick={toggleProfile}
              aria-expanded={profileOpen}
              aria-controls="profile-details"
            >
              <span className="avatar-mini">
                {firstName.charAt(0).toUpperCase()}
              </span>
              <span>My profile</span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          {isOverview && <div className="dashboard-welcome">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> YOUR BRAVO ACADEMY SPACE
              </div>

              <h1>
                Good day, {firstName}
                <span className="welcome-period">.</span>
              </h1>

              <p>
                {account?.role === 'admin'
                  ? 'Your academic competition workspace is ready.'
                  : 'Your next challenge starts with one good question.'}
              </p>
            </div>

            <div className="welcome-emblem">
              <Trophy size={25} />
              <span>STUDY<br />WITH PURPOSE</span>
            </div>
          </div>}

          {error && <Notice>{error}</Notice>}
          {success && <Notice tone="success">{success}</Notice>}

          {isOverview && <section className="profile-summary">
            <div className="profile-main">
              <div className="avatar-large">
                <GraduationCap size={24} />
              </div>

              <div>
                <div className="profile-kicker">{account?.profile.academic_level === 'Grade 12' ? 'YOUR SCHOOL' : 'YOUR ACADEMIC LEVEL'}</div>
                <h2>
                  {account?.profile.academic_level === 'Grade 12'
                    ? account?.profile.school_name || 'School profile pending'
                    : account?.profile.academic_level || 'Academic profile pending'}
                </h2>
                <p>
                  {account?.profile.stream || 'Stream not set'}
                </p>
              </div>
            </div>

            <button
              className="button button-outline"
              onClick={toggleProfile}
              aria-expanded={profileOpen}
              aria-controls="profile-details"
            >
              <UserRound size={16} />
              {profileOpen ? 'Hide profile' : 'View profile'}
            </button>
          </section>}

          {profileOpen && (
            <section className="profile-edit" id="profile-details">
              <div className="profile-panel-heading">
                <div>
                  <div className="eyebrow">ACCOUNT DETAILS</div>
                  <h2>Your profile</h2>
                  <p>
                    Your student details are visible only to you and authorized administrators.
                  </p>
                </div>

                <span className="profile-role-badge">
                  {account?.role === 'admin' ? 'Administrator' : 'Student'}
                </span>
              </div>

              <div className="profile-details-grid">
                <div className="profile-detail">
                  <span className="profile-detail-label">
                    <UserRound size={14} /> Full name
                  </span>
                  <strong>{account?.profile.full_name || 'Not set'}</strong>
                </div>

                <div className="profile-detail">
                  <span className="profile-detail-label">
                    {account?.user.phone ? <Phone size={14} /> : <Mail size={14} />}
                    Email or phone
                  </span>
                  <strong>
                    {account?.user.email || account?.user.phone || 'Not set'}
                  </strong>
                </div>

                <div className="profile-detail">
                  <span className="profile-detail-label">
                    <GraduationCap size={14} /> Academic level
                  </span>
                  <strong>{account?.profile.academic_level || 'Not set'}</strong>
                </div>

                {account?.profile.academic_level === 'Grade 12' && <div className="profile-detail">
                  <span className="profile-detail-label"><BookOpen size={14} /> School</span>
                  <strong>{account?.profile.school_name || 'Not set'}</strong>
                </div>}

                <div className="profile-detail">
                  <span className="profile-detail-label">
                    <Layers size={14} /> Stream
                  </span>
                  <strong>{account?.profile.stream || 'Not set'}</strong>
                </div>

                <div className="profile-detail">
                  <span className="profile-detail-label"><WalletCards size={14} /> CBE account</span>
                  <strong>{account?.profile.cbe_account_number || 'Not set'}</strong>
                </div>

                <div className="profile-detail profile-detail-id">
                  <span className="profile-detail-label">
                    Account ID
                  </span>
                  <strong title={account?.user.id}>
                    {account?.user.id}
                  </strong>
                </div>
              </div>

              <form className="profile-edit-form" onSubmit={saveProfile}>
                <label className="field-label">
                  Update display name
                  <div className="input-wrap">
                    <UserRound size={17} />
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                </label>

                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || !name.trim()}
                >
                  {saving ? 'Saving…' : 'Save name'}
                </button>
              </form>
            </section>
          )}

          {isOverview && account?.role === 'student' && <StudentOverview userId={account.user.id} />}
          {(location.pathname === '/study-room' || location.pathname === '/materials') && <Suspense fallback={<div className="study-empty-state"><span className="loading-inline" /> Loading your study workspace…</div>}><StudyRoomPage /></Suspense>}
          {location.pathname === '/bravos' && <BravoWalletPage />}
          {location.pathname === '/competitions' && <CompetitionPage />}
          {location.pathname === '/exams' && <ExamPage />}
          {location.pathname === '/leaderboard' && <StudentResultsPage mode="leaderboard" />}
          {location.pathname === '/rewards' && <StudentResultsPage mode="rewards" />}
          {location.pathname === '/notifications' && <NotificationsPage />}

          <footer className="dashboard-footer">
            <Brand compact />
            <span>Study with purpose. Compete with clarity.</span>
            <span className="footer-version">BRAVO / 01.01</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
