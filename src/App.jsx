import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import { AccountRecoveryPage, ResetPasswordPage } from './pages/AccountRecoveryPage.jsx';
import { LoadingScreen } from './components/UI.jsx';

function ProtectedRoute({ children }) {
  const { account, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return account ? children : <Navigate to="/login" replace />;
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
