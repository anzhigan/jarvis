import { useRef, useState } from 'react';
import { Loader2, Save, LogOut, Trash2, AlertCircle, User as UserIcon, Lock, Camera, Type, Minus, Plus, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { authApi, resolveUrl } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useT, useLangStore } from '../store/i18n';
import AvatarCropper from './AvatarCropper';

const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24];
const DEFAULT_FONT_SIZE = 16;

function getSavedFontSize(): number {
  const raw = localStorage.getItem('note-font-size');
  const n = raw ? parseInt(raw, 10) : DEFAULT_FONT_SIZE;
  return FONT_SIZES.includes(n) ? n : DEFAULT_FONT_SIZE;
}

export default function Profile() {
  const { user, logout, setUser, biometryAvailable, biometryType, biometryEnabled, enableBiometry, disableBiometry } = useAuthStore();
  const t = useT();
  const { lang, setLang } = useLangStore();

  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [fontSize, setFontSize] = useState<number>(getSavedFontSize);
  const [pendingFontSize, setPendingFontSize] = useState<number>(getSavedFontSize);
  const [savingFontSize, setSavingFontSize] = useState(false);

  const saveFontSize = () => {
    setSavingFontSize(true);
    try {
      localStorage.setItem('note-font-size', String(pendingFontSize));
      document.documentElement.style.setProperty('--editor-font-size', `${pendingFontSize}px`);
      setFontSize(pendingFontSize);
      toast.success('Font size saved');
    } finally {
      setSavingFontSize(false);
    }
  };

  const fontSizeDirty = pendingFontSize !== fontSize;

  if (!user) return null;

  const profileDirty = username !== user.username || email !== user.email;

  const saveProfile = async () => {
    if (!profileDirty) return;
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile({
        username: username !== user.username ? username : undefined,
        email: email !== user.email ? email : undefined,
      });
      setUser(updated);
      toast.success('Profile updated');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) { toast.error('Fill in all password fields'); return; }
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPassword !== repeatPassword) { toast.error('Passwords do not match'); return; }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      toast.success('Password changed');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAccount = async () => {
    if (!confirm('Delete your account permanently? All your notes, tasks and practices will be lost. This cannot be undone.')) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      toast.success('Account deleted');
      logout();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete account');
      setDeleting(false);
    }
  };

  const uploadAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image too large (max 10MB)'); return; }
    // Don't upload yet — open crop modal first
    setCropFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleCropConfirm = async (blob: Blob) => {
    setUploadingAvatar(true);
    try {
      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const updated = await authApi.uploadAvatar(croppedFile);
      setUser(updated);
      toast.success('Avatar updated');
      setCropFile(null);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const deleteAvatar = async () => {
    if (!user.avatar_url) return;
    try {
      const updated = await authApi.deleteAvatar();
      setUser(updated);
      toast.success('Avatar removed');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to remove avatar');
    }
  };

  return (
    <>
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    <div className="size-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your profile settings</p>
        </div>

        {/* Avatar */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user.avatar_url ? (
                <img src={resolveUrl(user.avatar_url)} alt="" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                  <UserIcon size={32} />
                </div>
              )}
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-transform"
                title="Change avatar"
              >
                {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={uploadAvatar}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold truncate">{user.username}</h2>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {user.avatar_url && (
                <button
                  onClick={deleteAvatar}
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove avatar
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Font size */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-chart-2/10 text-chart-2 flex items-center justify-center flex-shrink-0">
              <Type size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Note font size</h2>
              <p className="text-xs text-muted-foreground">Text size inside the note editor</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => {
                const idx = FONT_SIZES.indexOf(pendingFontSize);
                if (idx > 0) setPendingFontSize(FONT_SIZES[idx - 1]);
              }}
              disabled={FONT_SIZES.indexOf(pendingFontSize) <= 0}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30"
            >
              <Minus size={16} />
            </button>
            <div className="flex-1 text-center">
              <div className="text-3xl font-semibold">{pendingFontSize}px</div>
              {fontSizeDirty && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Unsaved (current: {fontSize}px)
                </div>
              )}
            </div>
            <button
              onClick={() => {
                const idx = FONT_SIZES.indexOf(pendingFontSize);
                if (idx < FONT_SIZES.length - 1) setPendingFontSize(FONT_SIZES[idx + 1]);
              }}
              disabled={FONT_SIZES.indexOf(pendingFontSize) >= FONT_SIZES.length - 1}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-1 justify-center flex-wrap mb-3">
            {FONT_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setPendingFontSize(n)}
                className={`h-8 px-2.5 text-xs rounded-md transition-colors ${
                  n === pendingFontSize ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="p-3 bg-muted/40 rounded-lg mb-3" style={{ fontSize: `${pendingFontSize}px`, lineHeight: 1.7 }}>
            The quick brown fox jumps over the lazy dog.
          </div>
          <div className="flex items-center justify-end gap-2">
            {fontSizeDirty && (
              <button
                onClick={() => setPendingFontSize(fontSize)}
                className="h-10 px-4 text-sm text-muted-foreground hover:text-foreground rounded-md"
              >
                Revert
              </button>
            )}
            <button
              onClick={saveFontSize}
              disabled={!fontSizeDirty || savingFontSize}
              className="h-10 px-5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
            >
              {savingFontSize ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </section>

        {/* Language */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
              <Languages size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">{t('profile.language')}</h2>
              <p className="text-xs text-muted-foreground">English / Русский</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setLang('en')}
              className={`h-11 rounded-lg font-medium text-sm border transition-all ${
                lang === 'en'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => setLang('ru')}
              className={`h-11 rounded-lg font-medium text-sm border transition-all ${
                lang === 'ru'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              🇷🇺 Русский
            </button>
          </div>
        </section>

        {/* Profile info */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <UserIcon size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Profile</h2>
              <p className="text-xs text-muted-foreground">Your display name and email</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
            </div>
            <button
              onClick={saveProfile}
              disabled={!profileDirty || savingProfile}
              className="h-11 md:h-10 px-5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save changes
            </button>
          </div>
        </section>

        {/* Password */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-chart-3/10 text-chart-3 flex items-center justify-center flex-shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Password</h2>
              <p className="text-xs text-muted-foreground">Change your password</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repeat new password</label>
              <input
                type="password"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className="w-full h-11 md:h-10 px-3 rounded-lg border border-border bg-input-background focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                autoComplete="new-password"
              />
            </div>
            <button
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
              className="h-11 md:h-10 px-5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2 transition-all"
            >
              {savingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Change password
            </button>
          </div>
        </section>

        {/* Biometry — only on native iOS/Android with available biometry */}
        {biometryAvailable && (
          <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
              <div className="flex-1">
                <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
                  {biometryType === 'faceId' ? 'Face ID' : biometryType === 'touchId' ? 'Touch ID' : 'Biometry'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {biometryEnabled
                    ? 'Required to open Jarvnote.'
                    : 'Use biometry instead of password to open the app.'}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (biometryEnabled) {
                    await disableBiometry();
                    toast.success('Biometry disabled');
                  } else {
                    const ok = await enableBiometry();
                    if (ok) toast.success('Biometry enabled');
                    else toast.error('Failed to enable biometry');
                  }
                }}
                className={`relative h-7 w-12 rounded-full transition-colors ${biometryEnabled ? 'bg-primary' : 'bg-muted'}`}
                aria-label="Toggle biometry"
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${biometryEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </button>
            </div>
          </section>
        )}

        {/* Logout */}
        <section className="mb-6 p-5 md:p-6 bg-card border border-border rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
            <div>
              <h2 className="text-base font-semibold mb-1">Sign out</h2>
              <p className="text-xs text-muted-foreground">Log out from this device</p>
            </div>
            <button
              onClick={logout}
              className="h-11 md:h-10 px-5 border border-border rounded-lg font-medium hover:bg-secondary flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="p-5 md:p-6 bg-card border border-destructive/20 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
              <p className="text-xs text-muted-foreground">Permanently delete your account</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This will delete your account and all associated data — notes, tasks, practices, uploaded images.
            This cannot be undone.
          </p>
          <button
            onClick={deleteAccount}
            disabled={deleting}
            className="h-11 md:h-10 px-5 bg-destructive text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2 transition-all"
          >
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete my account
          </button>
        </section>
      </div>
    </div>
    </>
  );
}
