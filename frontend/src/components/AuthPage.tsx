import { useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, register, isLoading } = useAuthStore();

  const handleSubmit = async () => {
    setError('');
    if (!email || !password || (mode === 'register' && !username)) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, username, password);
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Brain size={18} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Jarvnote</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-7 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            {mode === 'login'
              ? 'Sign in to your knowledge base'
              : 'Build your personal knowledge graph'}
          </p>

          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="h-11 px-3.5 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all"
            />

            {mode === 'register' && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="h-11 px-3.5 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all"
              />
            )}

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="h-11 px-3.5 rounded-lg border border-border bg-input-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all"
            />

            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="h-11 mt-1 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
            className="text-primary font-medium hover:underline"
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
