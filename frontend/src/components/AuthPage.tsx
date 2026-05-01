import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { ApiError } from '../api/client';
import { useT } from '../store/i18n';
import JarvnoteLogo from './JarvnoteLogo';

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
          style={{ background: 'var(--primary)' }}>
          <JarvnoteLogo size={36} variant="white" />
        </div>

        <h1 className="text-2xl font-semibold mb-1 tracking-tight">Welcome to Jarvnote</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--muted-foreground)' }}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </p>

        {/* Form card */}
        <form onSubmit={submit} className="w-full flex flex-col gap-3">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'var(--muted-foreground)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="input"
                style={{ height: 40 }}
              />
            </div>

            {mode === 'register' && (
              <div className="animate-slide-down">
                <label className="text-xs font-medium block mb-1.5"
                  style={{ color: 'var(--muted-foreground)' }}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="input"
                  style={{ height: 40 }}
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium block mb-1.5"
                style={{ color: 'var(--muted-foreground)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="input"
                style={{ height: 40 }}
              />
            </div>
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-md animate-slide-down"
              style={{
                background: 'var(--destructive-soft)',
                color: 'var(--danger)',
                borderRadius: 'var(--r-control)',
              }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-md btn-primary w-full mt-2"
            style={{ height: 44 }}
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
          className="mt-6 text-sm transition-colors hover:opacity-80"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {mode === 'login' ? (
            <>Don't have an account? <span style={{ color: 'var(--primary)' }} className="font-medium">Sign up</span></>
          ) : (
            <>Already have an account? <span style={{ color: 'var(--primary)' }} className="font-medium">Sign in</span></>
          )}
        </button>
      </div>
    </div>
  );
}
