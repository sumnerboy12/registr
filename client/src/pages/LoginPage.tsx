import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { AuthStatus } from '../types';
import EnvBadge from '../components/EnvBadge';

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_expired: 'Sign-in took too long — please try again.',
  oidc_no_email: "Your identity provider didn't share an email address, so Registr can't match your account.",
  oidc_no_account: 'No Registr person record matches your email. Ask an admin to add you under People.',
  oidc_no_access: "Your account exists but hasn't been granted access to Registr. Ask an admin to grant it.",
  oidc_failed: 'Sign-in failed. Please try again.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [env, setEnv] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAuthStatus()
      .then(setStatus)
      .catch(() => setStatus({ oidcEnabled: false, adminLoginEnabled: false }));
  }, []);

  useEffect(() => {
    api.getHealth().then((h) => setEnv(h.env)).catch(() => {});
  }, []);

  useEffect(() => {
    const oidcError = searchParams.get('error');
    if (oidcError) setError(OIDC_ERROR_MESSAGES[oidcError] ?? 'Sign-in failed. Please try again.');
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!status) return null;

  // Password field shows directly if it's the only way in; otherwise it's
  // tucked behind a toggle so SSO stays the obvious default and the
  // break-glass path doesn't invite routine use.
  const showAdminDirectly = status.adminLoginEnabled && !status.oidcEnabled;
  const adminFormVisible = showAdminDirectly || showAdminForm;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="card" style={{ width: 320, padding: 24 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, marginTop: 0, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="" width={24} height={24} style={{ borderRadius: 5 }} />
          Registr
          {env && <EnvBadge env={env} />}
        </h1>

        {!status.oidcEnabled && !status.adminLoginEnabled && (
          <div style={{ color: 'var(--text-dim)' }}>
            Sign-in isn't configured on this server — ask whoever manages it to set up SSO or an admin password.
          </div>
        )}

        {status.oidcEnabled && (
          <a
            href="/api/auth/oidc/login"
            className="btn btn-primary"
            style={{ width: '100%', display: 'block', textAlign: 'center', boxSizing: 'border-box', textDecoration: 'none' }}
          >
            Sign in with SSO
          </a>
        )}

        {adminFormVisible && (
          <>
            {status.oidcEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--text-dim)', fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                or
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}
            <div className="field">
              <label>Admin password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoFocus={!status.oidcEnabled}
              />
            </div>
            {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
            <button className="btn" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}

        {error && !adminFormVisible && <div style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}

        {status.oidcEnabled && status.adminLoginEnabled && !showAdminForm && (
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => setShowAdminForm(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: 12,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
