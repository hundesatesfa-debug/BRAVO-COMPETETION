import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import { AccountRecoveryPage, ResetPasswordPage } from './pages/AccountRecoveryPage.jsx';
import { LoadingScreen } from './components/UI.jsx';
import AdminPage from './pages/AdminPage.jsx';
import SuspendedPage from './pages/SuspendedPage.jsx';

const studentAccessAllowed = ['/dashboard', '/welcome', '/competitions'];

function ProtectedRoute({ children }) {
  const { account, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!account) return <Navigate to="/login" replace />;
  if (account.profile?.account_status === 'suspended') return <SuspendedPage />;
  if (account.role === 'student' && !account.profile?.has_verified_payment && !studentAccessAllowed.includes(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { account, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!account) return <Navigate to="/login" replace />;
  if (account.profile?.account_status === 'suspended') return <SuspendedPage />;
  return account.role === 'admin' ? children : <Navigate to="/dashboard" replace />;
}

function PublicOnlyRoute({ children }) {
  const { account, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return account ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PublicOnlyRoute><AuthPage mode="login" /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><AuthPage mode="register" /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><AccountRecoveryPage /></PublicOnlyRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/study-room" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/materials" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/bravos" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/competitions" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/exams" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/rewards" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><Navigate to="/admin/overview" replace /></AdminRoute>} />
      <Route path="/admin/:section" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
