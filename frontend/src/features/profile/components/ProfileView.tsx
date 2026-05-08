import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { applyTheme, getStoredTheme, type ThemeMode } from '../../../lib/theme';
import { useProfile, FONT_SIZES } from '../hooks/useProfile';
import { ProfilePane, type ProfileSectionKey } from './ProfilePane';
import './profile.css';

const PANE_COLLAPSED_KEY = 'jarvnote:profile:libCollapsed';

const THEMES: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: 'Light'  },
  { key: 'dark',  label: 'Dark'   },
  { key: 'auto',  label: 'System' },
];

/** Split a display name on the last word so it can render with an italic accent. */
function splitName(raw: string): { head: string; tail: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { head: '', tail: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { head: '', tail: parts[0] };
  return { head: parts.slice(0, -1).join(' '), tail: parts[parts.length - 1] };
}

export default function ProfileView() {
  const p = useProfile();
  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
  }, [paneCollapsed]);

  const [search, setSearch] = useState('');
  const [section, setSection] = useState<ProfileSectionKey>('account');

  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const onThemeChange = (next: ThemeMode) => {
    setTheme(next);
    applyTheme(next);
  };

  // Refs for scroll-to-section.
  const accountRef = useRef<HTMLElement | null>(null);
  const appearanceRef = useRef<HTMLElement | null>(null);
  const onSelectSection = (key: ProfileSectionKey) => {
    setSection(key);
    const target = key === 'account' ? accountRef.current : appearanceRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Dialogs — minimal local state, one boolean each.
  const [editName, setEditName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const user = p.user;
  const initial = (user?.username ?? user?.email ?? '?').slice(0, 1).toUpperCase();
  const { head, tail } = splitName(user?.username ?? user?.email ?? '');

  // Active routines = those that are not paused.
  const stats = p.stats;
  const topStreakStr = stats.topStreak === 0
    ? '0'
    : `${stats.topStreak}`;

  const filteredVisible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return { account: true, appearance: true, signOut: true, danger: true };
    const match = (label: string) => label.toLowerCase().includes(q);
    return {
      account:    match('account') || match('email') || match('password') || match('name') || match('username'),
      appearance: match('appearance') || match('theme') || match('reading') || match('font') || match('size'),
      signOut:    match('sign out') || match('logout'),
      danger:     match('delete') || match('danger'),
    };
  }, [search]);

  if (!user) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <ProfilePane
        active={section}
        onSelect={onSelectSection}
        search={search}
        setSearch={setSearch}
        collapsed={paneCollapsed}
        onCollapseToggle={() => setPaneCollapsed(true)}
        memberSince={p.memberSince || 'Member'}
      />

      {paneCollapsed && (
        <Tooltip content="Show library" side="right">
          <button
            className="pane-expand-floating"
            onClick={() => setPaneCollapsed(false)}
            aria-label="Show library"
          >
            <PanelLeftOpen />
          </button>
        </Tooltip>
      )}

      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Profile</b>
            <span className="breadcrumb-sep">›</span>
            <span>{section === 'account' ? 'Account' : 'Appearance'}</span>
          </div>
        </div>

        <div className="content-scroll">
          <div className="profile-canvas">
            <header className="pf-identity">
              <label
                className="pf-avatar"
                title={user.avatar_url ? 'Replace avatar' : 'Upload avatar'}
              >
                {user.avatar_url ? <img src={user.avatar_url} alt="avatar" /> : initial}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void p.uploadAvatar(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <div className="pf-id-text">
                <div className="go-kicker">{p.memberSince || 'Member'}</div>
                <h1 className="pf-name">
                  {head ? <>{head} <em>{tail}</em></> : <em>{tail || user.email}</em>}
                </h1>
                <p className="pf-id-meta">{user.email} · @{user.username}</p>
              </div>
            </header>

            <div className="pf-stats">
              <div className="pf-stat">
                <div className="pf-stat-num">{stats.activeGoals}</div>
                <div className="pf-stat-label">Active goals</div>
              </div>
              <div className="pf-stat">
                <div className="pf-stat-num">{stats.activeRoutines}</div>
                <div className="pf-stat-label">Active routines</div>
              </div>
              <div className="pf-stat">
                <div className="pf-stat-num">{topStreakStr}<em>d</em></div>
                <div className="pf-stat-label">Top streak</div>
              </div>
              <div className="pf-stat">
                <div className="pf-stat-num">{stats.streaksCount}</div>
                <div className="pf-stat-label">Streaks ≥ 3d</div>
              </div>
            </div>

            {filteredVisible.account && (
              <section className="pf-section" ref={accountRef as any} id="profile-account">
                <div className="pf-sect-head">
                  <h2 className="pf-sect-title">Account</h2>
                  <p className="pf-sect-sub">Your username, email, and password.</p>
                </div>
                <div className="pf-card">
                  <div className="pf-row">
                    <div className="pf-row-label">Display name</div>
                    <div className="pf-row-value">{user.username}</div>
                    <button className="pf-row-edit" onClick={() => setEditName(true)}>Edit</button>
                  </div>
                  <div className="pf-row">
                    <div className="pf-row-label">Email</div>
                    <div className="pf-row-value">{user.email}</div>
                    <button className="pf-row-edit" onClick={() => setEditEmail(true)}>Change</button>
                  </div>
                  <div className="pf-row">
                    <div className="pf-row-label">Username</div>
                    <div className="pf-row-value pf-row-mono">@{user.username}</div>
                    <button className="pf-row-edit" onClick={() => setEditName(true)}>Edit</button>
                  </div>
                  <div className="pf-row">
                    <div className="pf-row-label">Password</div>
                    <div className="pf-row-value">••••••••</div>
                    <button className="pf-row-edit" onClick={() => setEditPassword(true)}>Change</button>
                  </div>
                </div>
              </section>
            )}

            {filteredVisible.appearance && (
              <section className="pf-section" ref={appearanceRef as any} id="profile-appearance">
                <div className="pf-sect-head">
                  <h2 className="pf-sect-title">Appearance</h2>
                  <p className="pf-sect-sub">How Jarvnote looks and reads.</p>
                </div>
                <div className="pf-card">
                  <div className="pf-row">
                    <div className="pf-row-label">Theme</div>
                    <div className="pf-row-value pf-row-controls">
                      <div className="pill-seg" role="radiogroup">
                        {THEMES.map((t) => (
                          <button
                            key={t.key}
                            className={theme === t.key ? 'on' : ''}
                            role="radio"
                            aria-checked={theme === t.key}
                            onClick={() => onThemeChange(t.key)}
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="pf-row">
                    <div className="pf-row-label">Reading size</div>
                    <div className="pf-row-value pf-row-controls">
                      <div className="pill-seg" role="radiogroup">
                        {FONT_SIZES.map((n) => (
                          <button
                            key={n}
                            className={p.fontSize === n ? 'on' : ''}
                            role="radio"
                            aria-checked={p.fontSize === n}
                            onClick={() => p.setFontSize(n)}
                          >{n}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {filteredVisible.signOut && (
              <section className="pf-section">
                <div className="pf-card pf-card-clean">
                  <button className="pf-link" onClick={p.logout}>Sign out</button>
                </div>
              </section>
            )}

            {filteredVisible.danger && (
              <section className="pf-section">
                <div className="pf-sect-head">
                  <h2 className="pf-sect-title pf-danger-title">Point of no return</h2>
                  <p className="pf-sect-sub">
                    Deleting removes every note, goal, routine, and recorded entry. There is no recovery.
                  </p>
                </div>
                <div className="pf-card pf-card-danger">
                  <div className="pf-row">
                    <div style={{ flex: 1 }}>
                      <div className="pf-row-label" style={{ color: 'var(--rust)' }}>
                        Delete account
                      </div>
                      <div className="pf-row-meta">All data is removed within 24 hours.</div>
                    </div>
                    <button
                      className="pf-btn-danger"
                      onClick={() => setConfirmDelete(true)}
                    >Delete</button>
                  </div>
                </div>
              </section>
            )}

            <div style={{ height: 48 }} />
          </div>
        </div>
      </main>

      <EditNameDialog
        open={editName}
        onOpenChange={setEditName}
        currentName={user.username}
        onSave={async (next) => {
          const ok = await p.updateProfile({ username: next });
          if (ok) setEditName(false);
        }}
      />
      <EditEmailDialog
        open={editEmail}
        onOpenChange={setEditEmail}
        currentEmail={user.email}
        onSave={async (next) => {
          const ok = await p.updateProfile({ email: next });
          if (ok) setEditEmail(false);
        }}
      />
      <ChangePasswordDialog
        open={editPassword}
        onOpenChange={setEditPassword}
        onSave={async (current, next) => {
          const ok = await p.changePassword(current, next);
          if (ok) setEditPassword(false);
        }}
      />
      <DeleteAccountDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        confirmEmail={user.email}
        onConfirm={async () => {
          await p.deleteAccount();
          setConfirmDelete(false);
        }}
      />
    </>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

function EditNameDialog({ open, onOpenChange, currentName, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  currentName: string; onSave: (next: string) => Promise<void>;
}) {
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValue(currentName); }, [open, currentName]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit username"
      description="Username appears in your identity card and as your handle."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => { setBusy(true); await onSave(value.trim()); setBusy(false); }}
            disabled={busy || !value.trim() || value.trim() === currentName}
          >Save</Button>
        </>
      }
    >
      <div className="pf-form">
        <label>
          <div className="pf-form-label">Username</div>
          <input
            className="ui-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}

function EditEmailDialog({ open, onOpenChange, currentEmail, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  currentEmail: string; onSave: (next: string) => Promise<void>;
}) {
  const [value, setValue] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValue(currentEmail); }, [open, currentEmail]);

  const valid = /\S+@\S+\.\S+/.test(value.trim());
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change email"
      description="A confirmation flow is not yet wired — the email field updates immediately."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => { setBusy(true); await onSave(value.trim()); setBusy(false); }}
            disabled={busy || !valid || value.trim() === currentEmail}
          >Save</Button>
        </>
      }
    >
      <div className="pf-form">
        <label>
          <div className="pf-form-label">Email</div>
          <input
            className="ui-input"
            type="email"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {!valid && value && <p className="pf-form-error">That doesn't look like a valid email.</p>}
      </div>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onSave: (current: string, next: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); }
  }, [open]);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length >= 1 && next.length >= 8 && confirm === next;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      description="Use 8 or more characters. You'll stay signed in on this device."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => { setBusy(true); await onSave(current, next); setBusy(false); }}
            disabled={busy || !valid}
          >Update</Button>
        </>
      }
    >
      <div className="pf-form">
        <label>
          <div className="pf-form-label">Current password</div>
          <input
            className="ui-input"
            type="password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          <div className="pf-form-label">New password</div>
          <input
            className="ui-input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label>
          <div className="pf-form-label">Confirm new password</div>
          <input
            className="ui-input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {tooShort && <p className="pf-form-error">At least 8 characters.</p>}
        {mismatch && <p className="pf-form-error">Passwords don't match.</p>}
      </div>
    </Dialog>
  );
}

function DeleteAccountDialog({ open, onOpenChange, confirmEmail, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  confirmEmail: string; onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setTyped(''); }, [open]);

  const ok = typed.trim().toLowerCase() === confirmEmail.toLowerCase();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete account"
      description="This is irreversible. Type your email to confirm."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            disabled={busy || !ok}
            style={{ background: 'var(--rust)', color: 'var(--paper)' }}
          >Delete forever</Button>
        </>
      }
    >
      <div className="pf-form">
        <p className="pf-form-hint">
          Every note, goal, routine, and entry will be removed within 24 hours.
        </p>
        <label>
          <div className="pf-form-label">Type {confirmEmail} to confirm</div>
          <input
            className="ui-input"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
