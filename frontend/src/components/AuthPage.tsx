import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { ApiError } from '../api/client';
import { useT } from '../store/i18n';

export default function AuthPage() {
  const t = useT();
  const { login, register, isLoading } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!username.trim()) { setError('Username is required'); return; }
        await register(email, username, password);
      }
    } catch (e: any) {
      setError(e instanceof ApiError ? e.detail : 'Something went wrong');
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
      background: 'var(--bg-app)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: 'var(--tracking-tight)', color: 'var(--fg-primary)', marginBottom: 6 }}>
          Welcome to Jarvnote
        </div>
        <div style={{ fontSize: 16, color: 'var(--fg-muted)', marginBottom: 32 }}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </div>

        {/* Form card */}
        <form onSubmit={submit} style={{
          width: '100%',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--r-shell)',
          boxShadow: 'var(--sh-card)',
          padding: '24px 24px 28px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="input"
                style={{ width: '100%', height: 48, fontSize: 16, boxSizing: 'border-box' }}
              />
            </div>

            {mode === 'register' && (
              <div className="animate-slide-down">
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Username</div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="input"
                  style={{ width: '100%', height: 48, fontSize: 16, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="input"
                style={{ width: '100%', height: 48, fontSize: 16, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {error && (
            <div className="animate-slide-down" style={{
              fontSize: 14,
              padding: '10px 14px',
              borderRadius: 'var(--r-control)',
              background: 'rgba(188, 74, 72, 0.08)',
              color: 'var(--danger)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-md"
            style={{
              width: '100%', height: 52, marginTop: 4,
              background: 'var(--primary)', color: 'var(--primary-fg)',
              fontSize: 16, fontWeight: 600,
              borderRadius: 'var(--r-card)',
            }}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          style={{
            marginTop: 24,
            fontSize: 15,
            color: 'var(--fg-muted)',
            background: 'none', border: 0, cursor: 'pointer',
          }}
        >
          {mode === 'login' ? (
            <>Don't have an account? <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Sign up</span></>
          ) : (
            <>Already have an account? <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Sign in</span></>
          )}
        </button>
      </div>
    </div>
  );
}
