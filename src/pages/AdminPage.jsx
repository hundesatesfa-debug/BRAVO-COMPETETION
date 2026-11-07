import { useState } from 'react';
import {
  Activity, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, ClipboardCheck,
  CreditCard, FileCheck2, GraduationCap, LayoutDashboard, LogOut, Medal,
  Settings2, ShieldCheck, UsersRound, WalletCards,
} from 'lucide-react';
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AdminOverview from './admin/AdminOverview.jsx';
import AdminCompetitions from './admin/AdminCompetitions.jsx';
import AdminStudents from './admin/AdminStudents.jsx';
import AdminPayments from './admin/AdminPayments.jsx';
import AdminAcademics from './admin/AdminAcademics.jsx';
import AdminExaminations from './admin/AdminExaminations.jsx';
import AdminResults from './admin/AdminResults.jsx';
import AdminReports from './admin/AdminReports.jsx';
import AdminWeeklyOperations from './admin/AdminWeeklyOperations.jsx';
import AdminNotifications from './admin/AdminNotifications.jsx';
import AdminSettings from './admin/AdminSettings.jsx';
import AdminAudit from './admin/AdminAudit.jsx';

const navigation = [
  { to: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: 'students', label: 'Students', icon: UsersRound },
  { to: 'competitions', label: 'Competitions', icon: TrophyIcon },
  { to: 'payments', label: 'Payment review', icon: CreditCard },
  { to: 'refunds', label: 'Refunds', icon: FileCheck2 },
  { to: 'academics', label: 'Question bank', icon: BookOpen },
  { to: 'examinations', label: 'Exam scheduling', icon: CalendarDays },
  { to: 'monitoring', label: 'Exam monitoring', icon: Activity },
  { to: 'results', label: 'Results & rankings', icon: Medal },
  { to: 'payouts', label: 'Payouts', icon: WalletCards },
  { to: 'reports', label: 'Financial reports', icon: ChartNoAxesCombined },
  { to: 'weekly-operations', label: 'Sunday Operations', icon: ClipboardCheck },
  { to: 'notifications', label: 'Notifications', icon: Bell },
  { to: 'settings', label: 'System settings', icon: Settings2 },
  { to: 'audit', label: 'Audit logs', icon: ShieldCheck },
];

function TrophyIcon(props) { return <GraduationCap {...props} />; }

const pages = {
  overview: AdminOverview,
  students: AdminStudents,
  competitions: AdminCompetitions,
  payments: AdminPayments,
  refunds: AdminPayments,
  academics: AdminAcademics,
  examinations: AdminExaminations,
  monitoring: AdminExaminations,
  results: AdminResults,
  payouts: AdminResults,
  reports: AdminReports,
  'weekly-operations': AdminWeeklyOperations,
  notifications: AdminNotifications,
  settings: AdminSettings,
  audit: AdminAudit,
};

export default function AdminPage() {
  const { section = 'overview' } = useParams();
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const Section = pages[section];

  if (!Section) return <Navigate to="/admin/overview" replace />;
  async function logout() {
    setSigningOut(true); setError('');
    try { await signOut(); navigate('/login', { replace: true }); }
    catch (logoutError) { setError(logoutError.message); setSigningOut(false); }
  }

  const title = navigation.find((item) => item.to === section)?.label || 'Overview';
  return <div className="app-shell admin-app-shell">
    <aside className="app-sidebar admin-sidebar">
      <Brand />
      <div className="sidebar-label">ADMINISTRATION</div>
      <nav className="sidebar-nav admin-sidebar-nav">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={`/admin/${to}`} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}><Icon size={16} /><span>{label}</span><span className="nav-active-mark" /></NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink className="sidebar-item admin-student-link" to="/dashboard"><GraduationCap size={16} /> Student workspace</NavLink>
        <button className="sidebar-signout" onClick={logout} disabled={signingOut}><LogOut size={16} /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button>
      </div>
    </aside>
    <main className="dashboard-main admin-main">
      <header className="dashboard-topbar"><div className="breadcrumb"><span>BRAVO Academy</span><span className="crumb-slash">/</span><strong>{title}</strong></div><div className="topbar-right"><span className="account-role"><span className="role-dot" />Administrator</span><span className="admin-name-chip">{account?.profile?.full_name || 'Administrator'}</span></div></header>
      <div className="dashboard-content admin-content">{error && <Notice>{error}</Notice>}<Section {...(section === 'refunds' ? { refunds: true } : {})} {...(section === 'payouts' ? { payoutsOnly: true } : {})} {...(section === 'monitoring' ? { monitoring: true } : {})} />
        <footer className="dashboard-footer"><Brand compact /><span>BRAVO Academy · administrator console</span></footer>
      </div>
    </main>
  </div>;
}
