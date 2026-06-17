import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShieldAlert, ArrowLeft } from 'lucide-react';
import {
  adminApi,
  resolveUrl,
  type AdminOverview,
  type AdminUserRow,
} from '../../api/client';
import { useAuthStore } from '../../store/auth';
import './admin.css';

const PAGE_SIZE = 50;

interface KpiSpec {
  key: keyof AdminOverview;
  label: string;
  hint: string;
}

const KPIS: KpiSpec[] = [
  { key: 'total_users',     label: 'Users',       hint: 'All-time registered' },
  { key: 'active_users_7d', label: 'Active 7d',   hint: 'Seen in last 7 days' },
  { key: 'signups_7d',      label: 'New 7d',      hint: 'Registered in last 7 days' },
  { key: 'signups_30d',     label: 'New 30d',     hint: 'Registered in last 30 days' },
  { key: 'total_notes',     label: 'Notes',       hint: 'All users combined' },
  { key: 'total_tasks',     label: 'Goals',       hint: 'All users combined' },
  { key: 'total_routines',  label: 'Routines',    hint: 'All users combined' },
  { key: 'total_ai_jobs',   label: 'AI jobs',     hint: 'All users combined' },
];

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60)         return `${s}s ago`;
  if (s < 3600)       return `${Math.round(s / 60)}m ago`;
  if (s < 86400)      return `${Math.round(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.round(s / 86400)}d ago`;
  return fmtDate(iso);
}

export default function AdminView() {
  const { user } = useAuthStore();
  const isAdmin = !!user?.is_admin;

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, list] = await Promise.all([
        adminApi.overview(),
        adminApi.listUsers({ limit: PAGE_SIZE, offset, q: q || undefined }),
      ]);
      setOverview(ov);
      setUsers(list.items);
      setTotal(list.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [offset, q]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void fetchAll();
  }, [isAdmin, fetchAll]);

  // Debounce search input — wait 300ms after last keystroke before firing
  // the request. Page resets to 0 on a new query.
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const goBack = useCallback(() => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const pageInfo = useMemo(() => {
    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + users.length, total);
    return { from, to };
  }, [offset, users.length, total]);

  if (!user) {
    return (
      <div className="admin-shell admin-empty">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-shell admin-403">
        <ShieldAlert size={28} />
        <h1>Admin only</h1>
        <p>This dashboard is gated by the <code>is_admin</code> flag on your user.</p>
        <button className="admin-back" onClick={goBack}>
          <ArrowLeft size={14} /> Back to app
        </button>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-head">
        <button className="admin-back" onClick={goBack} aria-label="Back to app">
          <ArrowLeft size={14} /> App
        </button>
        <div className="admin-title-block">
          <h1 className="admin-title">Admin dashboard</h1>
          <span className="admin-sub">Live snapshot · data as of now</span>
        </div>
        <button
          type="button"
          className="admin-refresh"
          onClick={fetchAll}
          disabled={loading}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Refresh
        </button>
      </header>

      {error && (
        <div className="admin-error">
          {error}
        </div>
      )}

      <section className="admin-kpi-grid">
        {KPIS.map(({ key, label, hint }) => (
          <article key={key} className="admin-kpi">
            <div className="admin-kpi-label">{label}</div>
            <div className="admin-kpi-value">
              {overview ? fmtNum(overview[key]) : <span className="admin-kpi-dash">—</span>}
            </div>
            <div className="admin-kpi-hint">{hint}</div>
          </article>
        ))}
      </section>

      <section className="admin-users">
        <div className="admin-users-head">
          <h2 className="admin-users-title">Users</h2>
          <label className="admin-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Email or username…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last seen</th>
                <th className="admin-num">Notes</th>
                <th className="admin-num">Goals</th>
                <th className="admin-num">Routines</th>
                <th className="admin-num">AI</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const initial = (u.username[0] ?? '?').toUpperCase();
                const avatar = u.avatar_url ? resolveUrl(u.avatar_url) : null;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-avatar">
                          {avatar ? <img src={avatar} alt="" /> : initial}
                        </span>
                        <div className="admin-user-meta">
                          <span className="admin-username">
                            {u.username}
                            {u.is_admin && <span className="admin-badge admin-badge-admin">admin</span>}
                          </span>
                          <span className="admin-id" title={u.id}>{u.id.slice(0, 8)}…</span>
                        </div>
                      </div>
                    </td>
                    <td className="admin-email">{u.email}</td>
                    <td>
                      <span className={`admin-status${u.is_active ? '' : ' admin-status-off'}`}>
                        {u.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td title={fmtDate(u.created_at)}>{fmtRelative(u.created_at)}</td>
                    <td title={u.last_seen_at ? fmtDate(u.last_seen_at) : 'never seen'}>
                      {fmtRelative(u.last_seen_at)}
                    </td>
                    <td className="admin-num">{u.note_count}</td>
                    <td className="admin-num">{u.task_count}</td>
                    <td className="admin-num">{u.routine_count}</td>
                    <td className="admin-num">{u.ai_job_count}</td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="admin-empty-row">
                    {q ? `No users matching "${q}"` : 'No users yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="admin-pager">
          <span className="admin-pager-info">
            {pageInfo.from}–{pageInfo.to} of {fmtNum(total)}
          </span>
          <div className="admin-pager-btns">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={offset + users.length >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
