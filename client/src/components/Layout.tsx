import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import UserMenu from './UserMenu';
import EnvBadge from './EnvBadge';
import NavDropdown from './NavDropdown';

const REPO_URL = 'https://github.com/sumnerboy12/registr';
const MANUAL_URL = '/manual.html';

const REPORTS_ITEMS = [{ to: '/reports/job-value', label: 'Job Value' }];
const ADMIN_ITEMS = [
  { to: '/api-keys', label: 'API Keys' },
  { to: '/checklist-template', label: 'QA Checklist' },
];

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '10px 16px',
  color: isActive ? 'white' : 'var(--text-dim)',
  background: isActive ? 'var(--nav-accent)' : 'transparent',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: isActive ? 600 : 500,
  fontSize: 14,
});

export default function Layout() {
  const { user, logout } = useAuth();
  const reportsItems =
    user?.role === 'admin' ? [...REPORTS_ITEMS, { to: '/scheduled-reports', label: 'Scheduled Reports', divider: true }] : REPORTS_ITEMS;
  const [commit, setCommit] = useState<string | null>(null);
  const [env, setEnv] = useState<string | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((h) => {
        setCommit(h.commit);
        setEnv(h.env);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {commit ? (
            <a href={`${REPO_URL}/commit/${commit}`} target="_blank" rel="noopener noreferrer" title={`build ${commit}`}>
              <img src="/favicon.svg" alt="" width={22} height={22} style={{ borderRadius: 5, display: 'block' }} />
            </a>
          ) : (
            <img src="/favicon.svg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          )}
          <strong style={{ fontSize: 16 }}>Registr</strong>
          {env && <EnvBadge env={env} />}
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          <NavLink to="/" end style={navStyle}>
            Jobs
          </NavLink>
          <NavLink to="/clients" style={navStyle}>
            Clients
          </NavLink>
          <NavLink to="/people" style={navStyle}>
            People
          </NavLink>
          <NavLink to="/plant" style={navStyle}>
            Plant
          </NavLink>
          <NavDropdown label="Reports" items={reportsItems} />
          {user?.role === 'admin' && <NavDropdown label="Admin" items={ADMIN_ITEMS} />}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <a
            href={MANUAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="User manual"
            aria-label="User manual"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ?
          </a>
          <UserMenu name={user?.name ?? ''} onLogout={() => logout()} />
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
