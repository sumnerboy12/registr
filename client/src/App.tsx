import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ClientsPage from './pages/ClientsPage';
import PeoplePage from './pages/PeoplePage';
import ApiKeysPage from './pages/ApiKeysPage';
import ChangePasswordModal from './components/ChangePasswordModal';

function Gate() {
  const { user, loading, refresh } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;
  if (!user) return <LoginPage />;
  // Only reachable via password login — SSO sign-ins never carry a temporary
  // password to change.
  if (user.must_change_password) {
    return <ChangePasswordModal mandatory onClose={() => {}} onChanged={refresh} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectDetailPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="people" element={<PeoplePage />} />
        {user.role === 'admin' && <Route path="api-keys" element={<ApiKeysPage />} />}
      </Route>
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
