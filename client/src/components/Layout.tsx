import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';
import UserMenu from './UserMenu';

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
  const { user, logout, refresh } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);

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
          <img src="/favicon.svg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          <strong style={{ fontSize: 16 }}>registr</strong>
        </div>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 20 }}>
          <NavLink to="/" end style={navStyle}>
            Projects
          </NavLink>
          <NavLink to="/clients" style={navStyle}>
            Clients
          </NavLink>
          <NavLink to="/people" style={navStyle}>
            People
          </NavLink>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <UserMenu
            name={user?.name ?? ''}
            showChangePassword={!!user?.has_password}
            onChangePassword={() => setChangingPassword(true)}
            onLogout={() => logout()}
          />
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </main>
      {changingPassword && (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onChanged={() => {
            setChangingPassword(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
