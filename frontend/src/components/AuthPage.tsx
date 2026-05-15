import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { ApiError } from '../api/client';
import { Button, Input } from './ui';

export default function AuthPage() {
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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        background: 'var(--cream)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Brand sparkle — matches the rail icon, ring-removed sparkle in indigo. */}
        <div
          aria-hidden="true"
          style={{
            width: 44, height: 44,
            color: 'var(--indigo)',
            marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 32 32" width="44" height="44" fill="none">
            <g transform="rotate(25 16 16)">
              <path
                d="M16 2 C16 9 13 12 5 16 C13 20 16 23 16 30 C16 23 19 20 27 16 C19 12 16 9 16 2 Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--ink)',
            margin: '0 0 6px',
            lineHeight: 1.1,
          }}
        >
          Jarvnote
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontStyle: 'italic',
            fontSize: 15,
            color: 'var(--ink-4)',
            marginBottom: 28,
          }}
        >
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </div>

        <form
          onSubmit={submit}
          style={{
            width: '100%',
            background: 'var(--paper)',
            borderRadius: 'var(--r-shell)',
            boxShadow: 'var(--sh-card)',
            padding: '24px 24px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              inputSize="lg"
            />
          </Field>

          {mode === 'register' && (
            <div className="animate-slide-down">
              <Field label="Username">
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-handle"
                  inputSize="lg"
                />
              </Field>
            </div>
          )}

          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              inputSize="lg"
            />
          </Field>

          {error && (
            <div
              className="animate-slide-down"
              role="alert"
              style={{
                fontSize: 13,
                padding: '10px 12px',
                borderRadius: 'var(--r-control)',
                background: 'rgba(188, 74, 72, 0.08)',
                color: 'var(--rust)',
                boxShadow: '0 0 0 1px rgba(188, 74, 72, 0.22)',
              }}
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading}
            style={{ width: '100%', marginTop: 4, justifyContent: 'center' }}
          >
            {isLoading
              ? <Loader2 size={18} className="animate-spin" />
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          style={{
            marginTop: 22,
            fontSize: 14,
            color: 'var(--ink-4)',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {mode === 'login' ? (
            <>Don't have an account? <span style={{ color: 'var(--indigo)', fontWeight: 500 }}>Sign up</span></>
          ) : (
            <>Already have an account? <span style={{ color: 'var(--indigo)', fontWeight: 500 }}>Sign in</span></>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--ink-3)',
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
