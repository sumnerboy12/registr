import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
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
        <Route index element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectDetailPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="plant" element={<PlantPage />} />
        {user.role === 'admin' && <Route path="api-keys" element={<ApiKeysPage />} />}
      </Route>
      {/* /login?error=... is a real URL (server-side OIDC-failure redirect) — once
          logged in there's no route for it, so send it back to the projects list. */}
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
