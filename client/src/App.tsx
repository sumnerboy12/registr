import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import ClientsPage from './pages/ClientsPage';
import PeoplePage from './pages/PeoplePage';
import PlantPage from './pages/PlantPage';
import ApiKeysPage from './pages/ApiKeysPage';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<JobsPage />} />
        <Route path="jobs/new" element={<JobDetailPage />} />
        <Route path="jobs/:code" element={<JobDetailPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="plant" element={<PlantPage />} />
        {user.role === 'admin' && <Route path="api-keys" element={<ApiKeysPage />} />}
      </Route>
      {/* /login?error=... is a real URL (server-side OIDC-failure redirect) — once
          logged in there's no route for it, so send it back to the jobs list. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
