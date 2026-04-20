import { useRef, useState } from 'react';
import { Loader2, Save, LogOut, Trash2, AlertCircle, User as UserIcon, Lock, Camera, Type, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/auth';

const FONT_SIZES = [14, 16, 18, 20, 22, 24, 28];

function getSavedFontSize(): number {
  const raw = localStorage.getItem('note-font-size');
  const n = raw ? parseInt(raw, 10) : 18;
  return FONT_SIZES.includes(n) ? n : 18;
}

export default function Profile() {
  const { user, logout, setUser } = useAuthStore();

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

  const [fontSize, setFontSize] = useState<number>(getSavedFontSize);

  const applyFontSize = (n: number) => {
    setFontSize(n);
    localStorage.setItem('note-font-size', String(n));
    document.documentElement.style.setProperty('--editor-font-size', `${n}px`);
  };

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

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image too large (max 5MB)'); return; }
    setUploadingAvatar(true);
    try {
      const updated = await authApi.uploadAvatar(file);
      setUser(updated);
      toast.success('Avatar updated');
    } catch (e2: any) {
      toast.error(e2?.detail ?? 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
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
                <img src={user.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
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
                const idx = FONT_SIZES.indexOf(fontSize);
                if (idx > 0) applyFontSize(FONT_SIZES[idx - 1]);
              }}
              disabled={FONT_SIZES.indexOf(fontSize) <= 0}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30"
            >
              <Minus size={16} />
            </button>
            <div className="flex-1 text-center">
              <div className="text-3xl font-semibold">{fontSize}px</div>
            </div>
            <button
              onClick={() => {
                const idx = FONT_SIZES.indexOf(fontSize);
                if (idx < FONT_SIZES.length - 1) applyFontSize(FONT_SIZES[idx + 1]);
              }}
              disabled={FONT_SIZES.indexOf(fontSize) >= FONT_SIZES.length - 1}
              className="h-10 w-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex gap-1 justify-center">
            {FONT_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => applyFontSize(n)}
                className={`h-8 px-2.5 text-xs rounded-md transition-colors ${
                  n === fontSize ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 bg-muted/40 rounded-lg" style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}>
            The quick brown fox jumps over the lazy dog.
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
  );
}
