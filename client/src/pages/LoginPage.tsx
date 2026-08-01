import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

const OIDC_ERROR_MESSAGES: Record<string, string> = {
  oidc_expired: 'Sign-in took too long — please try again.',
  oidc_no_email: "Your identity provider didn't share an email address, so registr can't match your account.",
  oidc_no_account: 'No registr person record matches your email. Ask an admin to add you under People.',
  oidc_no_access: "Your account exists but hasn't been granted access to registr. Ask an admin to grant it.",
  oidc_failed: 'Sign-in failed. Please try again.',
};

export default function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    api.getOidcStatus().then((s) => setOidcEnabled(s.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    const oidcError = searchParams.get('error');
    if (oidcError) setError(OIDC_ERROR_MESSAGES[oidcError] ?? 'Sign-in failed. Please try again.');
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!username || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div className="card" style={{ width: 340, padding: 24 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, marginTop: 0, marginBottom: 20 }}>
          <img src="/favicon.svg" alt="" width={24} height={24} style={{ borderRadius: 5 }} />
          registr
        </h1>
        {oidcEnabled && (
          <>
            <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>Sign in with your Wayman Roofing Microsoft 365 account.</p>
            <a
              href="/api/auth/oidc/login"
              className="btn btn-primary"
              style={{ width: '100%', display: 'block', textAlign: 'center', boxSizing: 'border-box', textDecoration: 'none' }}
            >
              Sign in with Microsoft
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--text-dim)', fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              or sign in with a password
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          </>
        )}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus={!oidcEnabled} />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        <button className="btn" onClick={handleSubmit} disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
