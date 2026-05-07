/**
 * Profile & Settings — single screen that opens when the user taps the avatar.
 *
 * Layout:
 *   • Avatar hero (gradient avatar + name + email + change-photo)
 *   • Stats strip (active goals · routines · top streak)
 *   • Account: change password, photo
 *   • Appearance: theme (Light / Dark / Auto inline), text size, language
 *   • Data: export (todo), privacy (todo), about
 *   • Sign out
 *   • Danger zone: delete account
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Loader2, Camera, Lock, Type, Globe, Sun, Database, Shield, Info, LogOut,
  ChevronRight, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { authApi, resolveUrl, routinesApi, tasksApi } from '../api/client';
import type { Routine, Task } from '../api/types';
import { useAuthStore } from '../store/auth';
import { useT, useLangStore } from '../store/i18n';
import { applyTheme, type ThemeMode } from '../lib/theme';
import AvatarCropper from './AvatarCropper';
import ConfirmDialog from './ConfirmDialog';
import CreateSheet, { FormField } from './CreateSheet';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24];
const DEFAULT_FONT_SIZE = 16;

function getSavedFontSize(): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('note-font-size') : null;
  const n = raw ? parseInt(raw, 10) : DEFAULT_FONT_SIZE;
  return FONT_SIZES.includes(n) ? n : DEFAULT_FONT_SIZE;
}

function getSavedTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem('jarvnote:theme');
  return v === 'dark' || v === 'light' ? v : 'auto';
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Same formula as Metrics.computeStreak (consecutive due+done days back from today).
function computeRoutineStreak(r: Routine): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const created = new Date(r.created_at); created.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (d < created) break;
    if (r.is_paused) break;
    const key = isoDate(d);
    const done = r.entries.some((e) => e.date === key && e.value > 0);
    if (done) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ─── Building blocks ─────────────────────────────────────────────────────────
function SectionLabel({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: danger ? 'var(--danger)' : 'var(--fg-muted)',
        padding: '14px 18px 6px',
      }}
    >
      {children}
    </div>
  );
}

interface ListRowProps {
  icon: ReactNode;
  iconColor?: string;
  iconBg?: string;
  title: ReactNode;
  sub?: ReactNode;
  aux?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  noBorder?: boolean;
}
function ListRow({ icon, iconColor, iconBg, title, sub, aux, trailing, onClick, noBorder }: ListRowProps) {
  const Component = (onClick ? 'button' : 'div') as 'button' | 'div';
  return (
    <Component
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '13px 16px',
        background: 'transparent', border: 0,
        borderTop: noBorder ? '0' : '0.5px solid var(--line)',
        cursor: onClick ? 'pointer' : 'default',
        font: 'inherit', textAlign: 'left',
        color: 'var(--fg-primary)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor ?? 'var(--fg-secondary)',
          background: iconBg ?? 'var(--bg-input)',
        }}
      >{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, display: 'block' }}>{title}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
      {aux && <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{aux}</span>}
      {trailing}
      {onClick && !trailing && (
        <span style={{ color: 'var(--fg-faint)', display: 'inline-flex' }}>
          <ChevronRight size={16} />
        </span>
      )}
    </Component>
  );
}

function ListCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: '0 16px 14px',
        background: 'var(--bg-card)', borderRadius: 14,
        boxShadow: 'var(--sh-card)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ─── Theme picker (inline 3-button segment) ─────────────────────────────────
function ThemeSegment({ value, onChange }: { value: ThemeMode; onChange: (v: ThemeMode) => void }) {
  return (
    <div
      role="tablist"
      style={{
        display: 'inline-flex', gap: 4,
        background: 'var(--bg-input)',
        borderRadius: 999, padding: 3,
        marginLeft: 'auto',
      }}
    >
      {(['light', 'dark', 'auto'] as const).map((v) => (
        <button
          key={v}
          role="tab"
          type="button"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          style={{
            padding: '5px 12px', border: 0,
            background: value === v ? 'var(--bg-elevated)' : 'transparent',
            color: value === v ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
            font: 'inherit', fontSize: 12, fontWeight: 500,
            borderRadius: 999, cursor: 'pointer',
            boxShadow: value === v ? '0 0 0 0.5px var(--line)' : 'none',
            textTransform: 'capitalize',
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, logout, setUser } = useAuthStore();
  const t = useT();
  const { lang, setLang } = useLangStore();

  // ── Stats (tiny load — only metrics that fit the strip)
  const [goals, setGoals] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    Promise.all([tasksApi.list().catch(() => []), routinesApi.list().catch(() => [])])
      .then(([g, r]) => { setGoals(g); setRoutines(r); });
  }, []);

  const stats = useMemo(() => {
    const activeGoals = goals.filter((g) => g.status === 'active').length;
    const activeRoutines = routines.filter((r) => !r.is_paused).length;
    const topStreak = activeRoutines > 0
      ? Math.max(0, ...routines.filter((r) => !r.is_paused).map(computeRoutineStreak))
      : 0;
    return { activeGoals, activeRoutines, topStreak };
  }, [goals, routines]);

  // ── Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image too large (max 10MB)'); return; }
    setCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const onConfirmCrop = async (blob: Blob) => {
    setUploadingAvatar(true);
    try {
      const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const updated = await authApi.uploadAvatar(cropped);
      setUser(updated);
      toast.success('Avatar updated');
      setCropFile(null);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.avatar_url) return;
    try {
      const updated = await authApi.deleteAvatar();
      setUser(updated);
      toast.success('Avatar removed');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to remove avatar');
    }
  };

  // ── Theme
  const [theme, setThemeState] = useState<ThemeMode>(getSavedTheme);
  const setTheme = (v: ThemeMode) => { setThemeState(v); applyTheme(v); };

  // ── Text size
  const [fontSize, setFontSize] = useState<number>(getSavedFontSize);
  const [showFontSheet, setShowFontSheet] = useState(false);
  const [pendingFont, setPendingFont] = useState<number>(fontSize);

  const saveFont = async () => {
    localStorage.setItem('note-font-size', String(pendingFont));
    document.documentElement.style.setProperty('--editor-font-size', `${pendingFont}px`);
    setFontSize(pendingFont);
    setShowFontSheet(false);
    toast.success('Font size saved');
  };

  // ── Language
  const [showLangSheet, setShowLangSheet] = useState(false);

  // ── Change password
  const [showPwSheet, setShowPwSheet] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [repeatPw, setRepeatPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const submitPw = async () => {
    if (!currentPw || !newPw) { toast.error('Fill in all fields'); return; }
    if (newPw.length < 8) { toast.error('New password must be ≥ 8 characters'); return; }
    if (newPw !== repeatPw) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setRepeatPw('');
      setShowPwSheet(false);
      toast.success('Password changed');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  // ── Sign out / delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      toast.success('Account deleted');
      logout();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete account');
      setDeleting(false);
    }
    setConfirmDelete(false);
  };

  if (!user) return null;

  const initial = (user.username || user.email || '?').charAt(0).toUpperCase();

  return (
    <>
      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onConfirmCrop} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete account?"
        message="This will permanently delete your account and all your notes, tasks, routines and uploaded images. This cannot be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />

      {/* Change password — bottom sheet */}
      <CreateSheet
        open={showPwSheet}
        onClose={() => setShowPwSheet(false)}
        title="Change password"
        primaryLabel={savingPw ? 'Saving…' : 'Save'}
        canSubmit={!!currentPw && !!newPw && !!repeatPw && !savingPw}
        onSubmit={submitPw}
      >
        <FormField label="Current password">
          <input
            type="password" autoComplete="current-password"
            className="input w-full"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
          />
        </FormField>
        <FormField label="New password">
          <input
            type="password" autoComplete="new-password" placeholder="At least 8 characters"
            className="input w-full"
            value={newPw} onChange={(e) => setNewPw(e.target.value)}
          />
        </FormField>
        <FormField label="Repeat new password">
          <input
            type="password" autoComplete="new-password"
            className="input w-full"
            value={repeatPw} onChange={(e) => setRepeatPw(e.target.value)}
          />
        </FormField>
      </CreateSheet>

      {/* Text size — bottom sheet */}
      <CreateSheet
        open={showFontSheet}
        onClose={() => { setShowFontSheet(false); setPendingFont(fontSize); }}
        title="Note text size"
        primaryLabel="Save"
        canSubmit={pendingFont !== fontSize}
        onSubmit={saveFont}
      >
        <FormField label={`${pendingFont}px`}>
          <input
            type="range" min={FONT_SIZES[0]} max={FONT_SIZES[FONT_SIZES.length - 1]}
            step={1}
            value={pendingFont}
            onChange={(e) => setPendingFont(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--brand, var(--accent-notes))' }}
          />
        </FormField>
        <div
          style={{
            padding: 16, marginTop: 4,
            background: 'var(--bg-input)',
            borderRadius: 10,
            fontSize: `${pendingFont}px`, lineHeight: 1.6,
          }}
        >
          The quick brown fox jumps over the lazy dog.
        </div>
      </CreateSheet>

      {/* Language — bottom sheet */}
      <CreateSheet
        open={showLangSheet}
        onClose={() => setShowLangSheet(false)}
        title="Language"
        primaryLabel="Done"
        canSubmit={true}
        onSubmit={async () => { setShowLangSheet(false); }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([
            { v: 'en' as const, label: 'English' },
            { v: 'ru' as const, label: 'Русский' },
          ]).map((it) => (
            <button
              key={it.v}
              type="button"
              onClick={() => setLang(it.v)}
              style={{
                height: 48, borderRadius: 12, font: 'inherit', fontSize: 14, fontWeight: 500,
                background: lang === it.v ? 'var(--fg-primary)' : 'var(--bg-input)',
                color: lang === it.v ? 'var(--primary-fg)' : 'var(--fg-secondary)',
                border: 0, cursor: 'pointer',
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      </CreateSheet>

      <input
        ref={avatarInputRef} type="file" accept="image/*"
        onChange={onPickAvatar}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />

      <div className="size-full overflow-y-auto" style={{ background: 'var(--bg-app)' }}>
        {/* Compact navbar (mobile + desktop alike for this screen) */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 4px', height: 50,
            position: 'sticky', top: 0, zIndex: 5,
            background: 'color-mix(in srgb, var(--bg-app) 85%, transparent)',
            backdropFilter: 'saturate(180%) blur(12px)',
          }}
        >
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'notes' }))}
            style={{
              background: 'transparent', border: 0, padding: 6,
              color: 'var(--fg-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              font: 'inherit', fontSize: 14,
            }}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
            Back
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Profile</span>
          <span style={{ width: 60 }} />
        </div>

        <div style={{ paddingBottom: 32 }}>

          {/* Avatar hero */}
          <div style={{ padding: '24px 18px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => avatarInputRef.current?.click()}
              style={{
                width: 72, height: 72, borderRadius: 999, border: 0, padding: 0,
                cursor: 'pointer',
                background: user.avatar_url
                  ? 'transparent'
                  : 'linear-gradient(135deg, var(--accent-notes) 0%, var(--accent-analysis) 100%)',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em',
                boxShadow: user.avatar_url
                  ? 'none'
                  : '0 8px 24px color-mix(in srgb, var(--accent-notes) 30%, transparent)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
              aria-label="Change photo"
            >
              {user.avatar_url ? (
                <img src={resolveUrl(user.avatar_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : initial}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.username}
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                style={{
                  marginTop: 8, background: 'transparent', border: 0, padding: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  font: 'inherit', fontSize: 11.5, fontWeight: 500,
                  color: 'var(--accent-notes)', cursor: 'pointer',
                }}
              >
                {uploadingAvatar ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                {user.avatar_url ? 'Change photo' : 'Add photo'}
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
              margin: '0 16px 16px', padding: '14px 8px',
              background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)',
            }}
          >
            <div style={{ textAlign: 'center', borderRight: '1px solid var(--line)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{stats.activeGoals}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Active goals</div>
            </div>
            <div style={{ textAlign: 'center', borderRight: '1px solid var(--line)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{stats.activeRoutines}</div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Routines</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {stats.topStreak}<span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>d</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Top streak</div>
            </div>
          </div>

          {/* Account */}
          <SectionLabel>Account</SectionLabel>
          <ListCard>
            <ListRow
              icon={<Lock size={16} />}
              iconColor="var(--accent-notes)"
              iconBg="color-mix(in srgb, var(--accent-notes) 12%, transparent)"
              title="Change password"
              onClick={() => setShowPwSheet(true)}
              noBorder
            />
            {user.avatar_url && (
              <ListRow
                icon={<Camera size={16} />}
                iconColor="var(--accent-sprints)"
                iconBg="color-mix(in srgb, var(--accent-sprints) 12%, transparent)"
                title="Photo"
                sub="Tap to remove current photo"
                onClick={removeAvatar}
              />
            )}
          </ListCard>

          {/* Appearance */}
          <SectionLabel>Appearance</SectionLabel>
          <ListCard>
            <ListRow
              icon={<Sun size={16} />}
              iconColor="var(--accent-goals)"
              iconBg="color-mix(in srgb, var(--accent-goals) 12%, transparent)"
              title="Theme"
              trailing={<ThemeSegment value={theme} onChange={setTheme} />}
              noBorder
            />
            <ListRow
              icon={<Type size={16} />}
              iconColor="var(--accent-analysis)"
              iconBg="color-mix(in srgb, var(--accent-analysis) 12%, transparent)"
              title="Text size"
              sub="Default for notes"
              aux={`${fontSize}px`}
              onClick={() => { setPendingFont(fontSize); setShowFontSheet(true); }}
            />
            <ListRow
              icon={<Globe size={16} />}
              iconColor="var(--accent-routines)"
              iconBg="color-mix(in srgb, var(--accent-routines) 12%, transparent)"
              title={t('profile.language')}
              aux={lang === 'en' ? 'English' : 'Русский'}
              onClick={() => setShowLangSheet(true)}
            />
          </ListCard>

          {/* Data */}
          <SectionLabel>Data</SectionLabel>
          <ListCard>
            <ListRow
              icon={<Database size={16} />}
              title="Export"
              sub="Download all your notes & data"
              onClick={() => toast.info('Export coming soon')}
              noBorder
            />
            <ListRow
              icon={<Shield size={16} />}
              title="Privacy"
              onClick={() => toast.info('Privacy policy coming soon')}
            />
            <ListRow
              icon={<Info size={16} />}
              title="About"
              sub="Version 1.5.0"
              onClick={() => toast.info('Jarvnote · v1.5.0')}
            />
          </ListCard>

          {/* Sign out */}
          <div style={{ padding: '8px 16px 0' }}>
            <button
              onClick={logout}
              style={{
                width: '100%', padding: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'var(--bg-card)', boxShadow: 'var(--sh-card)',
                border: 0, borderRadius: 12, cursor: 'pointer',
                font: 'inherit', fontSize: 14, fontWeight: 500,
                color: 'var(--fg-secondary)',
              }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>

          {/* Danger zone */}
          <SectionLabel danger>Danger zone</SectionLabel>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            style={{
              width: 'calc(100% - 32px)', margin: '0 16px',
              padding: 12, background: 'transparent',
              color: 'var(--danger)', border: 0, borderRadius: 12,
              font: 'inherit', fontSize: 14, fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {deleting && <Loader2 size={14} className="animate-spin" />}
            Delete account
          </button>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', textAlign: 'center', padding: '6px 24px 12px', lineHeight: 1.5 }}>
            All your notes, tasks and data will be permanently removed. This cannot be undone.
          </div>
        </div>
      </div>
    </>
  );
}

