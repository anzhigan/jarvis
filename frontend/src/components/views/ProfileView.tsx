import { useEffect, useMemo, useRef, useState } from 'react';
import {
  User as UserIcon, Palette, Globe, Database, Camera, Loader2, Sun, Moon, Monitor,
  Lock, LogOut, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { authApi, resolveUrl, routinesApi, tasksApi } from '../../api/client';
import type { Routine, Task } from '../../api/types';
import { useAuthStore } from '../../store/auth';
import { useT, useLangStore } from '../../store/i18n';
import { Avatar, Button, Dialog, Input, Segmented } from '../ui';
import { currentStreak } from './routines/heatmap';

type Section = 'account' | 'appearance' | 'language' | 'data';
type ThemeMode = 'light' | 'dark' | 'auto';

const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24];

function getSavedTheme(): ThemeMode {
  const v = localStorage.getItem('jarvnote:theme');
  return v === 'dark' || v === 'light' ? v : 'auto';
}
function applyTheme(mode: ThemeMode) {
  if (mode === 'auto') {
    localStorage.removeItem('jarvnote:theme');
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  } else {
    localStorage.setItem('jarvnote:theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }
}

export default function ProfileView() {
  const { user, logout, init } = useAuthStore();
  const t = useT();
  const lang = useLangStore();

  const [section, setSection] = useState<Section>(() => {
    const saved = localStorage.getItem('jarvnote:profile:section');
    if (saved === 'account' || saved === 'appearance' || saved === 'language' || saved === 'data') return saved;
    return 'account';
  });
  useEffect(() => { localStorage.setItem('jarvnote:profile:section', section); }, [section]);

  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme);
  const [fontSize, setFontSize] = useState<number>(() => {
    const raw = localStorage.getItem('note-font-size');
    const n = raw ? parseInt(raw, 10) : 16;
    return FONT_SIZES.includes(n) ? n : 16;
  });

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    Promise.all([routinesApi.list().catch(() => []), tasksApi.list().catch(() => [])])
      .then(([r, ts]) => { setRoutines(r); setTasks(ts); });
  }, []);

  const stats = useMemo(() => {
    const activeGoals = tasks.filter((t) => t.status === 'active').length;
    const activeRoutines = routines.filter((r) => !r.is_paused).length;
    let bestStreak = 0;
    for (const r of routines) {
      const s = currentStreak(r);
      if (s > bestStreak) bestStreak = s;
    }
    return { activeGoals, activeRoutines, bestStreak };
  }, [tasks, routines]);

  if (!user) return <div className="dt-page" data-visible="true" />;

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      await authApi.uploadAvatar(file);
      await init();
      toast.success('Avatar updated');
    } catch (err: any) {
      toast.error(err?.detail ?? 'Failed to upload');
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!confirm('Remove avatar?')) return;
    setAvatarBusy(true);
    try {
      await authApi.deleteAvatar();
      await init();
      toast.success('Avatar removed');
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setAvatarBusy(false); }
  };

  const submitPassword = async () => {
    if (!pwOld || !pwNew || pwNew !== pwConfirm) return;
    setPwBusy(true);
    try {
      await authApi.changePassword(pwOld, pwNew);
      toast.success('Password updated');
      setPwOld(''); setPwNew(''); setPwConfirm('');
      setPwOpen(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to change password');
    } finally { setPwBusy(false); }
  };

  const submitDelete = async () => {
    if (delConfirm !== 'DELETE') return;
    try {
      await authApi.deleteAccount();
      toast.success('Account deleted');
      logout();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  const NAV: { key: Section; label: string; icon: React.ElementType }[] = [
    { key: 'account',    label: 'Account',    icon: UserIcon },
    { key: 'appearance', label: 'Appearance', icon: Palette },
    { key: 'language',   label: 'Language',   icon: Globe },
    { key: 'data',       label: 'Account data', icon: Database },
  ];

  return (
    <div className="dt-page" data-visible="true">
      <div className="dt-vw">
        <header className="dt-vw-head">
          <div className="dt-vw-head-text">
            <h1 className="dt-vw-title">Profile & Settings</h1>
            <p className="dt-vw-subtitle">Manage your account, appearance, and preferences</p>
          </div>
        </header>

        <div className="dt-vw-body">
          <div className="pf-layout">
            <nav className="pf-nav">
              {NAV.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className="pf-nav-item"
                  data-active={section === key || undefined}
                  onClick={() => setSection(key)}
                >
                  <Icon className="icon" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="pf-content">
              {section === 'account' && (
                <>
                  <div className="pf-section">
                    <div className="pf-hero">
                      <div className="relative">
                        <Avatar
                          src={user.avatar_url ? resolveUrl(user.avatar_url) : undefined}
                          name={user.username}
                          size="xl"
                        />
                        <button
                          type="button"
                          className="ui-icon-btn absolute -bottom-1 -right-1 bg-[var(--bg-card)] shadow-[var(--sh-card)]"
                          onClick={() => fileRef.current?.click()}
                          aria-label="Change avatar"
                        >
                          {avatarBusy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="pf-hero-name">{user.username}</div>
                        <div className="pf-hero-email">{user.email}</div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button variant="ghost" onClick={() => fileRef.current?.click()}>Change photo</Button>
                        {user.avatar_url && <Button variant="ghost" onClick={removeAvatar}>Remove</Button>}
                      </div>
                    </div>

                    <div className="pf-stat-strip">
                      <div className="pf-stat-cell">
                        <span className="label">Active goals</span>
                        <span className="value">{stats.activeGoals}</span>
                      </div>
                      <div className="pf-stat-cell">
                        <span className="label">Active routines</span>
                        <span className="value">{stats.activeRoutines}</span>
                      </div>
                      <div className="pf-stat-cell">
                        <span className="label">Top streak</span>
                        <span className="value">{stats.bestStreak}d</span>
                      </div>
                    </div>
                  </div>

                  <div className="pf-section">
                    <div className="pf-section-title">Account</div>
                    <div className="pf-section-desc">Email and username are read from your registration.</div>
                    <div className="pf-row">
                      <div className="pf-row-text">
                        <div className="pf-row-label">Username</div>
                        <div className="pf-row-desc">{user.username}</div>
                      </div>
                    </div>
                    <div className="pf-row">
                      <div className="pf-row-text">
                        <div className="pf-row-label">Email</div>
                        <div className="pf-row-desc">{user.email}</div>
                      </div>
                    </div>
                    <div className="pf-row">
                      <div className="pf-row-text">
                        <div className="pf-row-label">Password</div>
                        <div className="pf-row-desc">Update your password to keep your account secure.</div>
                      </div>
                      <Button onClick={() => setPwOpen(true)}>
                        <Lock size={13} /> Change password
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {section === 'appearance' && (
                <div className="pf-section">
                  <div className="pf-section-title">Appearance</div>
                  <div className="pf-section-desc">How Jarvnote looks for you.</div>

                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">Theme</div>
                      <div className="pf-row-desc">Light, dark, or follow system.</div>
                    </div>
                    <Segmented<ThemeMode>
                      value={theme}
                      onChange={(v) => { setTheme(v); applyTheme(v); }}
                      options={[
                        { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={11}/> Light</span> },
                        { value: 'dark',  label: <span className="inline-flex items-center gap-1.5"><Moon size={11}/> Dark</span> },
                        { value: 'auto',  label: <span className="inline-flex items-center gap-1.5"><Monitor size={11}/> Auto</span> },
                      ]}
                    />
                  </div>

                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">Editor text size</div>
                      <div className="pf-row-desc">Affects rich-text editor body. Currently {fontSize}px.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {FONT_SIZES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setFontSize(n);
                            localStorage.setItem('note-font-size', String(n));
                            document.documentElement.style.setProperty('--editor-font-size', `${n}px`);
                          }}
                          className="ui-icon-btn"
                          data-active={fontSize === n || undefined}
                          style={{ width: 32, fontSize: 12 }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {section === 'language' && (
                <div className="pf-section">
                  <div className="pf-section-title">Language</div>
                  <div className="pf-section-desc">Interface language.</div>
                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">{t('lang.label') || 'Language'}</div>
                      <div className="pf-row-desc">English / Русский</div>
                    </div>
                    <Segmented
                      value={lang.lang}
                      onChange={(v) => lang.setLang(v as 'en' | 'ru')}
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'ru', label: 'Русский' },
                      ]}
                    />
                  </div>
                </div>
              )}

              {section === 'data' && (
                <>
                  <div className="pf-section">
                    <div className="pf-section-title">Sign out</div>
                    <div className="pf-section-desc">End this session on this device. You can sign back in any time.</div>
                    <Button onClick={logout}><LogOut size={13} /> Sign out</Button>
                  </div>

                  <div className="pf-section" data-tone="danger">
                    <div className="pf-section-title">Delete account</div>
                    <div className="pf-section-desc">
                      This permanently deletes your account, notes, goals, routines, and sprints. There is no undo.
                    </div>
                    <Button variant="danger" onClick={() => setDelOpen(true)}>
                      <Trash2 size={13} /> Delete account
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={pwOpen}
        onOpenChange={(o) => !o && setPwOpen(false)}
        title="Change password"
        description="Choose a strong, unique password."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={submitPassword}
              disabled={!pwOld || !pwNew || pwNew !== pwConfirm || pwBusy}
            >
              {pwBusy ? 'Updating…' : 'Update password'}
            </Button>
          </>
        }
      >
        <div className="dt-field">
          <label className="dt-field-label">Current password</label>
          <Input type="password" autoFocus value={pwOld} onChange={(e) => setPwOld(e.target.value)} />
        </div>
        <div className="dt-field">
          <label className="dt-field-label">New password</label>
          <Input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Confirm new password</label>
          <Input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
          {pwConfirm && pwNew !== pwConfirm && (
            <span className="text-xs text-[var(--danger)]">Passwords don't match</span>
          )}
        </div>
      </Dialog>

      <Dialog
        open={delOpen}
        onOpenChange={(o) => !o && setDelOpen(false)}
        title="Delete account"
        description="Type DELETE in caps to confirm. This action is irreversible."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={submitDelete} disabled={delConfirm !== 'DELETE'}>
              Delete account permanently
            </Button>
          </>
        }
      >
        <div className="dt-field">
          <Input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" />
        </div>
      </Dialog>
    </div>
  );
}
