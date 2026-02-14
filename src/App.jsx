import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import ClientDashboard from './pages/ClientDashboard';
import CheckIn from './pages/CheckIn';
import CheckInHistory from './pages/CheckInHistory';
import CoachDashboard from './pages/CoachDashboard';
import ClientDetail from './pages/ClientDetail';
import Profile from './pages/Profile';
import Toolbox from './pages/Toolbox';

function ProtectedRoute({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        user ? (
          user.role === 'coach' ? <Navigate to="/coach" /> : <Navigate to="/dashboard" />
        ) : <Navigate to="/login" />
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>
      } />
      <Route path="/checkin" element={
        <ProtectedRoute role="client"><CheckIn /></ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute role="client"><CheckInHistory /></ProtectedRoute>
      } />
      <Route path="/coach" element={
        <ProtectedRoute role="coach"><CoachDashboard /></ProtectedRoute>
      } />
      <Route path="/coach/client/:id" element={
        <ProtectedRoute role="coach"><ClientDetail /></ProtectedRoute>
      } />
      <Route path="/toolbox" element={
        <ProtectedRoute role="client"><Toolbox /></ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute><Profile /></ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-dvh bg-forest-900">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
