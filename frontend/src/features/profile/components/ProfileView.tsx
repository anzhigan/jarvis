import { useEffect, useRef, useState } from 'react';
import {
  Camera, Lock, Sun, Moon, Monitor, LogOut, Trash2, User as UserIcon,
  Palette, Globe, Database, Eye, FileText, HelpCircle,
} from 'lucide-react';
import { resolveUrl } from '../../../api/client';
import { Button, Dialog, Input } from '../../../components/ui';
import { applyTheme, getStoredTheme, type ThemeMode } from '../../../lib/theme';
import { useLangStore, type Lang } from '../../../store/i18n';
import { useProfile, FONT_SIZES } from '../hooks/useProfile';
import './profile.css';

type PaneSection = 'account' | 'appearance' | 'language' | 'data';

export default function ProfileView() {
  const p = useProfile();
  const lang = useLangStore();

  const [paneSection, setPaneSection] = useState<PaneSection>(
    () => (localStorage.getItem('jarvnote:profile:section') as PaneSection) || 'account',
  );
  useEffect(() => { localStorage.setItem('jarvnote:profile:section', paneSection); }, [paneSection]);

  const [theme, setThemeState] = useState<ThemeMode>(getStoredTheme);
  const setTheme = (mode: ThemeMode) => { setThemeState(mode); applyTheme(mode); };

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!p.user) {
    return (
      <main className="content">
        <div className="content-empty">Not signed in.</div>
      </main>
    );
  }

  const initial = (p.user.username?.[0] ?? '?').toUpperCase();
  const avatarSrc = p.user.avatar_url ? resolveUrl(p.user.avatar_url) : undefined;

  const onPickAvatar = () => fileInputRef.current?.click();
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await p.uploadAvatar(file);
    if (e.target) e.target.value = '';
  };

  const submitPassword = async () => {
    if (pwNext.length < 8) { return; }
    if (pwNext !== pwConfirm) { return; }
    setPwSubmitting(true);
    const ok = await p.changePassword(pwCurrent, pwNext);
    setPwSubmitting(false);
    if (ok) {
      setPwOpen(false);
      setPwCurrent(''); setPwNext(''); setPwConfirm('');
    }
  };

  return (
    <>
      <aside className="pane">
        <header className="pane-head">
          <div className="pane-title-block">
            <div className="pane-title">Profile</div>
            <div className="pane-sub">{p.user.email}</div>
          </div>
        </header>

        <div className="pane-body" style={{ paddingTop: 8 }}>
          <div className="lib-section">
            <div className="lib-section-label"><span>Settings</span></div>
            <button className="lib-row" data-active={paneSection === 'account' || undefined}
                    onClick={() => setPaneSection('account')}>
              <span className="ico"><UserIcon /></span>
              <span className="name">Account</span>
            </button>
            <button className="lib-row" data-active={paneSection === 'appearance' || undefined}
                    onClick={() => setPaneSection('appearance')}>
              <span className="ico"><Palette /></span>
              <span className="name">Appearance</span>
            </button>
            <button className="lib-row" data-active={paneSection === 'language' || undefined}
                    onClick={() => setPaneSection('language')}>
              <span className="ico"><Globe /></span>
              <span className="name">Language</span>
            </button>
            <button className="lib-row" data-active={paneSection === 'data' || undefined}
                    onClick={() => setPaneSection('data')}>
              <span className="ico"><Database /></span>
              <span className="name">Data &amp; account</span>
            </button>
          </div>

          <div className="lib-section">
            <div className="lib-section-label"><span>About</span></div>
            <button className="lib-row" disabled style={{ opacity: 0.6 }}>
              <span className="ico"><Eye /></span>
              <span className="name">Privacy</span>
            </button>
            <button className="lib-row" disabled style={{ opacity: 0.6 }}>
              <span className="ico"><FileText /></span>
              <span className="name">Terms of use</span>
            </button>
            <button className="lib-row" disabled style={{ opacity: 0.6 }}>
              <span className="ico"><HelpCircle /></span>
              <span className="name">Help &amp; support</span>
            </button>
          </div>
        </div>

        <div className="pane-foot">
          <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', padding: '0 4px' }}>
            Jarvnote v1.0.0
          </span>
        </div>
      </aside>

      <main className="content">
        <div className="content-bar">
          <div className="content-title">
            <span>{paneSection === 'account' ? 'Account'
                : paneSection === 'appearance' ? 'Appearance'
                : paneSection === 'language' ? 'Language'
                : 'Data & account'}</span>
          </div>
        </div>

        <div className="content-scroll">
          <div className="profile-canvas">
            {/* Identity card — always visible */}
            <section className="pf-card pf-identity">
              <div className="pf-avatar-block">
                <div className="pf-avatar-large">
                  {avatarSrc ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initial}
                </div>
                <button className="pf-avatar-edit" onClick={onPickAvatar} title="Change photo" aria-label="Change photo">
                  <Camera />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onAvatarChange}
                />
              </div>
              <div className="pf-identity-meta">
                <div className="pf-identity-name">{p.user.username}</div>
                <div className="pf-identity-email">{p.user.email}</div>
                <div className="pf-identity-since">{p.memberSince}</div>
              </div>

              <div className="pf-stat-strip">
                <div className="pf-stat-cell">
                  <span className="pf-stat-value">{p.stats.activeGoals}</span>
                  <span className="pf-stat-label">Active goals</span>
                </div>
                <div className="pf-stat-divider" />
                <div className="pf-stat-cell">
                  <span className="pf-stat-value">{p.stats.activeRoutines}</span>
                  <span className="pf-stat-label">Active routines</span>
                </div>
                <div className="pf-stat-divider" />
                <div className="pf-stat-cell">
                  <span className="pf-stat-value pf-stat-streak">{p.stats.topStreak}</span>
                  <span className="pf-stat-label">Top streak</span>
                </div>
              </div>
            </section>

            {/* Account section */}
            {paneSection === 'account' && (
              <>
                <section className="pf-card">
                  <h3 className="pf-card-title">Account</h3>
                  <p className="pf-card-desc">Email and username are read from your registration.</p>

                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">Username</div>
                      <div className="pf-row-desc">{p.user.username}</div>
                    </div>
                  </div>

                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">Email</div>
                      <div className="pf-row-desc">{p.user.email}</div>
                    </div>
                  </div>

                  <div className="pf-row">
                    <div className="pf-row-text">
                      <div className="pf-row-label">Password</div>
                      <div className="pf-row-desc">Update your password to keep your account secure.</div>
                    </div>
                    <button className="pf-btn" onClick={() => setPwOpen(true)}>
                      <Lock /> Change password
                    </button>
                  </div>
                </section>

                <section className="pf-card">
                  <h3 className="pf-card-title">Sign out</h3>
                  <p className="pf-card-desc">End this session on this device. You can sign back in any time.</p>
                  <button className="pf-btn" onClick={p.logout}>
                    <LogOut /> Sign out
                  </button>
                </section>
              </>
            )}

            {/* Appearance section */}
            {paneSection === 'appearance' && (
              <section className="pf-card">
                <h3 className="pf-card-title">Appearance</h3>
                <p className="pf-card-desc">How Jarvnote looks for you.</p>

                <div className="pf-row">
                  <div className="pf-row-text">
                    <div className="pf-row-label">Theme</div>
                    <div className="pf-row-desc">Light, dark, or follow system.</div>
                  </div>
                  <div className="seg pf-seg" role="tablist">
                    <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
                      <Sun /> Light
                    </button>
                    <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
                      <Moon /> Dark
                    </button>
                    <button className={theme === 'auto' ? 'on' : ''} onClick={() => setTheme('auto')}>
                      <Monitor /> Auto
                    </button>
                  </div>
                </div>

                <div className="pf-row">
                  <div className="pf-row-text">
                    <div className="pf-row-label">Editor text size</div>
                    <div className="pf-row-desc">Affects rich-text editor body. Currently {p.fontSize}px.</div>
                  </div>
                  <div className="pf-fontsize-row">
                    {FONT_SIZES.map((n) => (
                      <button
                        key={n}
                        className={`pf-fontsize-btn${n === p.fontSize ? ' pf-fontsize-on' : ''}`}
                        onClick={() => p.setFontSize(n)}
                      >{n}</button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Language section */}
            {paneSection === 'language' && (
              <section className="pf-card">
                <h3 className="pf-card-title">Language</h3>
                <p className="pf-card-desc">Interface language.</p>

                <div className="pf-row">
                  <div className="pf-row-text">
                    <div className="pf-row-label">Language</div>
                    <div className="pf-row-desc">English / Русский</div>
                  </div>
                  <div className="seg pf-seg" role="tablist">
                    <button
                      className={lang.lang === 'en' ? 'on' : ''}
                      onClick={() => lang.setLang('en' as Lang)}
                    >English</button>
                    <button
                      className={lang.lang === 'ru' ? 'on' : ''}
                      onClick={() => lang.setLang('ru' as Lang)}
                    >Русский</button>
                  </div>
                </div>
              </section>
            )}

            {/* Data section — danger zone */}
            {paneSection === 'data' && (
              <section className="pf-card pf-danger">
                <h3 className="pf-card-title">Delete account</h3>
                <p className="pf-card-desc">
                  This permanently deletes your account, notes, goals, routines, and sprints.
                  There is no undo.
                </p>
                <button className="pf-btn pf-btn-danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete account
                </button>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* ── Change password dialog ────────────────────────────────────── */}
      <Dialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        title="Change password"
        description="Use 8 or more characters."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            type="password"
            placeholder="Current password"
            value={pwCurrent}
            onChange={(e) => setPwCurrent(e.target.value)}
          />
          <Input
            type="password"
            placeholder="New password"
            value={pwNext}
            onChange={(e) => setPwNext(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={pwConfirm}
            onChange={(e) => setPwConfirm(e.target.value)}
          />
          {pwNext.length > 0 && pwNext.length < 8 && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              Password must be at least 8 characters.
            </span>
          )}
          {pwNext.length >= 8 && pwConfirm.length > 0 && pwNext !== pwConfirm && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>
              Passwords don't match.
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submitPassword}
            disabled={pwSubmitting || pwCurrent.length === 0 || pwNext.length < 8 || pwNext !== pwConfirm}
          >
            {pwSubmitting ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </Dialog>

      {/* ── Delete account confirmation ─────────────────────────────── */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteConfirmText(''); }}
        title="Delete account?"
        description={`Type "${p.user.username}" to confirm. This cannot be undone.`}
      >
        <Input
          placeholder={p.user.username}
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={deleteConfirmText !== p.user.username}
            onClick={async () => {
              setDeleteOpen(false);
              await p.deleteAccount();
            }}
          >
            Delete forever
          </Button>
        </div>
      </Dialog>
    </>
  );
}
