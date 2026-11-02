import { useState } from 'react';
import { Building2, ChevronDown, Command, Eye, EyeOff, Hash, LogOut, Mail, Phone, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import CompetitionWorkspace from '../components/CompetitionWorkspace.jsx';
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
  const [showCbeNumber, setShowCbeNumber] = useState(false);

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
    try { await signOut(); navigate('/login', { replace: true }); }
    catch (logoutError) { setError(logoutError.message); setSigningOut(false); }
  }

  function toggleProfile() {
    setProfileOpen((open) => !open);
    setShowCbeNumber(false);
    setError('');
    setSuccess('');
  }

  return <div className="app-shell">
    <aside className="app-sidebar"><Brand /><div className="sidebar-label">WORKSPACE</div><nav className="sidebar-nav"><Link className="sidebar-item active" to="/dashboard"><Command size={17} />Overview<span className="nav-active-mark" /></Link></nav><div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><ShieldCheck size={17} /></div><strong>Compete with confidence</strong><p>Your official results are always tied to your examination score.</p></div><button className="sidebar-signout" onClick={logout} disabled={signingOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button></div></aside>
    <main className="dashboard-main"><header className="dashboard-topbar"><div className="breadcrumb"><span>BR@VO</span><span className="crumb-slash">/</span><strong>Overview</strong></div><div className="topbar-right"><span className="account-role"><span className="role-dot" />{account?.role === 'admin' ? 'Administrator' : 'Student'}</span><button className="account-chip" onClick={toggleProfile} aria-expanded={profileOpen} aria-controls="profile-details"><span className="avatar-mini">{firstName.charAt(0).toUpperCase()}</span><span>My profile</span><ChevronDown size={15} /></button></div></header>
      <div className="dashboard-content"><div className="dashboard-welcome"><div><div className="eyebrow"><span className="live-dot" /> YOUR BR@VO SPACE</div><h1>Good day, {firstName}<span className="welcome-period">.</span></h1><p>{account?.role === 'admin' ? 'Your academic competition workspace is ready.' : 'Your next challenge starts with one good question.'}</p></div><div className="welcome-emblem"><Trophy size={25} /><span>EST. FOR THE<br />CURIOUS</span></div></div>

        {error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}

        <section className="profile-summary"><div className="profile-main"><div className="avatar-large"><UserRound size={24} /></div><div><div className="profile-kicker">YOUR CLASSIFICATION</div><h2>{levelLabels[account?.profile.academic_level] || 'Academic level not set'}</h2><p>{streamLabels[account?.profile.stream] || 'Stream not set'} <span className="profile-separator">·</span> {account?.user.email}</p></div></div><button className="button button-outline" onClick={toggleProfile} aria-expanded={profileOpen} aria-controls="profile-details"><UserRound size={16} /> {profileOpen ? 'Hide profile' : 'View profile'}</button></section>

        {profileOpen && <section className="profile-edit" id="profile-details"><div className="profile-panel-heading"><div><div className="eyebrow">ACCOUNT DETAILS</div><h2>Your profile</h2><p>These details are visible only in your signed-in account.</p></div><span className="profile-role-badge">{account?.role === 'admin' ? 'Administrator' : 'Student'}</span></div><div className="profile-details-grid"><div className="profile-detail"><span className="profile-detail-label"><UserRound size={14} /> Full name</span><strong>{account?.profile.full_name || 'Not set'}</strong></div><div className="profile-detail"><span className="profile-detail-label"><Mail size={14} /> Email</span><strong>{account?.user.email || 'Not set'}</strong></div><div className="profile-detail"><span className="profile-detail-label"><Phone size={14} /> Phone</span><strong>{account?.profile.phone_number || 'Not provided'}</strong></div><div className="profile-detail"><span className="profile-detail-label"><Building2 size={14} /> CBE account</span><strong className="profile-secret">{account?.profile.cbe_account_number ? (showCbeNumber ? account.profile.cbe_account_number : `••••••••${account.profile.cbe_account_number.slice(-4)}`) : 'Not provided'}{account?.profile.cbe_account_number && <button className="profile-reveal" type="button" onClick={() => setShowCbeNumber((shown) => !shown)} aria-label={showCbeNumber ? 'Hide CBE account number' : 'Show CBE account number'}>{showCbeNumber ? <EyeOff size={14} /> : <Eye size={14} />}</button>}</strong></div><div className="profile-detail"><span className="profile-detail-label"><BookOpen size={14} /> Academic level</span><strong>{levelLabels[account?.profile.academic_level] || 'Not set'}</strong></div><div className="profile-detail"><span className="profile-detail-label"><Sparkles size={14} /> Academic stream</span><strong>{streamLabels[account?.profile.stream] || 'Not set'}</strong></div><div className="profile-detail profile-detail-id"><span className="profile-detail-label"><Hash size={14} /> Account ID</span><strong title={account?.user.id}>{account?.user.id}</strong></div></div><form className="profile-edit-form" onSubmit={saveProfile}><label className="field-label">Update display name<div className="input-wrap"><UserRound size={17} /><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div></label><button className="button button-primary" type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save name'}</button></form></section>}

        <CompetitionWorkspace />

        <footer className="dashboard-footer"><Brand compact /><span>Built for every mind ready to rise.</span><span className="footer-version">BR@VO / 01.01</span></footer>
      </div>
    </main>
  </div>;
}
