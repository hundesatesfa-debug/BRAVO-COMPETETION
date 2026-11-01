import { useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, ChevronDown, CircleUserRound, Command, LogOut, Medal, Settings2, ShieldCheck, Sparkles, Trophy, UserRound, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const levelLabels = { grade_12: 'Grade 12', freshman: 'University Freshman' };
const streamLabels = { natural_science: 'Natural Science', social_science: 'Social Science' };

export default function DashboardPage() {
  const { account, signOut, refreshAccount } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(account?.profile.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const firstName = (account?.profile.full_name || account?.user.email || 'Learner').split(' ')[0];

  async function saveProfile(event) {
    event.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    const { error: updateError } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', account.user.id);
    if (updateError) setError(updateError.message);
    else { await refreshAccount(account.user); setSuccess('Your profile is updated.'); }
    setSaving(false);
  }

  async function logout() {
    setSigningOut(true);
    try { await signOut(); navigate('/', { replace: true }); }
    catch (logoutError) { setError(logoutError.message); setSigningOut(false); }
  }

  return <div className="app-shell">
    <aside className="app-sidebar"><Brand /><div className="sidebar-label">WORKSPACE</div><nav className="sidebar-nav"><Link className="sidebar-item active" to="/dashboard"><Command size={17} />Overview<span className="nav-active-mark" /></Link></nav><div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><strong>Compete with confidence</strong><p>Your official results are always tied to your examination score.</p></div><button className="sidebar-signout" onClick={logout} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button></div></aside>
    <main className="dashboard-main"><header className="dashboard-topbar"><div className="breadcrumb"><span>BR@VO</span><span className="crumb-slash">/</span><strong>Overview</strong></div><div className="topbar-right"><span className="account-role"><span className="role-dot" />{account?.role === 'admin' ? 'Administrator' : 'Student'}</span><button className="account-chip" onClick={() => { setProfileOpen((open) => !open); setError(''); setSuccess(''); }} aria-expanded={profileOpen}><span className="avatar-mini">{firstName.charAt(0).toUpperCase()}</span><span>{firstName}</span><ChevronDown size={15} /></button></div></header>
      <div className="dashboard-content"><div className="dashboard-welcome"><div><div className="eyebrow"><span className="live-dot" /> YOUR BR@VO SPACE</div><h1>Good day, {firstName}<span className="welcome-period">.</span></h1><p>{account?.role === 'admin' ? 'Your academic competition workspace is ready.' : 'Your next challenge starts with one good question.'}</p></div><div className="welcome-emblem"><Trophy size={25} /><span>EST. FOR THE<br />CURIOUS</span></div></div>

        {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}

        <section className="profile-summary"><div className="profile-main"><div className="avatar-large"><UserRound size={24} /></div><div><div className="profile-kicker">YOUR CLASSIFICATION</div><h2>{levelLabels[account?.profile.academic_level] || 'Academic level not set'}</h2><p>{streamLabels[account?.profile.stream] || 'Stream not set'} <span className="profile-separator">·</span> {account?.user.email}</p></div></div><button className="button button-outline" onClick={() => setProfileOpen((open) => !open)}><Settings2 size={16} /> Edit profile</button></section>

        {profileOpen && <section className="profile-edit"><div><h2>Profile settings</h2><p>Your academic classification is saved with your account.</p></div><form onSubmit={saveProfile}><label className="field-label">Full name<div className="input-wrap"><UserRound size={17} /><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div></label><label className="field-label">Academic level<div className="read-only-field">{levelLabels[account?.profile.academic_level]}</div></label><label className="field-label">Academic stream<div className="read-only-field">{streamLabels[account?.profile.stream]}</div></label><button className="button button-primary" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save profile'}</button></form></section>}

        <section className="dashboard-section-heading"><div><div className="eyebrow">A CLEAR PATH FORWARD</div><h2>Make your next move</h2></div><span className="section-note">Your workspace, in one place</span></section>
        <section className="feature-grid">
          <article className="feature-panel competition-panel"><div className="panel-top"><span className="panel-icon gold-icon"><Trophy size={19} /></span><span className="panel-index">01 / COMPETE</span></div><div className="panel-copy"><h3>Competitions</h3><p>Independent academic challenges, fair score-based rankings, and your chance to rise.</p></div><div className="panel-footer"><span className="panel-status"><span className="status-dash" /> Competition listings will appear here</span><Medal size={18} className="muted-medal" /></div></article>
          <article className="feature-panel learning-panel"><div className="panel-top"><span className="panel-icon cyan-icon"><BookOpen size={19} /></span><span className="panel-index">02 / LEARN</span></div><div className="panel-copy"><h3>Study &amp; practice</h3><p>Subject notes and focused practice matched to your academic path.</p></div><div className="panel-footer"><span className="panel-status"><span className="status-dash" /> Your learning library starts here</span><ArrowUpRight size={18} className="muted-medal" /></div></article>
        </section>

        <section className="dashboard-bottom-grid"><article className="next-step-card"><div className="next-step-icon"><CalendarDays size={20} /></div><div><div className="eyebrow">UP NEXT</div><h3>Stay tuned for your first challenge</h3><p>New competition details will be shared here as soon as they are published.</p></div><span className="next-step-spark">✦</span></article><article className="tutor-card"><span className="tutor-icon"><Sparkles size={18} /></span><span className="panel-index">YOUR STUDY COMPANION</span><h3>Curiosity is a good start.</h3><p>Your BR@VO tutor will be here to help you make sense of the hard stuff.</p><div className="tutor-footer"><UsersRound size={15} /> Personalized to your path</div></article></section>

        <footer className="dashboard-footer"><Brand compact /><span>Built for every mind ready to rise.</span><span className="footer-version">BR@VO / 01.01</span></footer>
      </div>
    </main>
  </div>;
}
