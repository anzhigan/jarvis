import { useState } from 'react';
import { Loader2, Save, LogOut, Trash2, AlertCircle, User as UserIcon, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/auth';

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
    if (!currentPassword || !newPassword) {
      toast.error('Fill in all password fields');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== repeatPassword) {
      toast.error('Passwords do not match');
      return;
    }
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

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your profile settings
          </p>
        </div>

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
