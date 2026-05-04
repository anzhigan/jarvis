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
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, letterSpacing: 'var(--tracking-tight)', color: 'var(--fg-primary)', marginBottom: 4 }}>
          Welcome to Jarvnote
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', marginBottom: 28 }}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </div>

        {/* Form card */}
        <form onSubmit={submit} style={{
          width: '100%',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--r-shell)',
          boxShadow: 'var(--sh-card)',
          padding: '20px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 5 }}>Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="input"
                style={{ width: '100%', height: 40, boxSizing: 'border-box' }}
              />
            </div>

            {mode === 'register' && (
              <div className="animate-slide-down">
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 5 }}>Username</div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="input"
                  style={{ width: '100%', height: 40, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--fg-tertiary)', marginBottom: 5 }}>Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="input"
                style={{ width: '100%', height: 40, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {error && (
            <div className="animate-slide-down" style={{
              fontSize: 'var(--text-xs)',
              padding: '8px 12px',
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
              width: '100%', height: 44, marginTop: 2,
              background: 'var(--primary)', color: 'var(--primary-fg)',
              fontSize: 'var(--text-base)', fontWeight: 600,
              borderRadius: 'var(--r-card)',
            }}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          style={{
            marginTop: 20,
            fontSize: 'var(--text-sm)',
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
