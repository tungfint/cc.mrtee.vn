import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Avatar, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui';
import { api } from '../lib/api';

interface AccountData {
  user: {
    id: string;
    email: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    timezone: string;
    status: string;
    system_role: string;
  };
  memberships: {
    organization_id: string;
    organization_name: string;
    organization_slug: string;
    role: string;
  }[];
}

export default function AccountPage() {
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ['me'], queryFn: () => api<AccountData>('/me') });
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  useEffect(() => {
    if (!account.data) return;
    setFullName(account.data.user.full_name);
    setDisplayName(account.data.user.display_name);
    setTimezone(account.data.user.timezone);
    setAvatarUrl(account.data.user.avatar_url ?? '');
  }, [account.data]);
  const updateProfile = useMutation({
    mutationFn: () =>
      api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, displayName, timezone, avatarUrl }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
    },
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
    },
  });
  if (account.isPending) return <LoadingState label="Đang tải tài khoản…" />;
  if (account.error || !account.data) return <ErrorState error={account.error} />;
  const user = account.data.user;
  const save = (event: FormEvent) => {
    event.preventDefault();
    updateProfile.mutate();
  };
  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    changePassword.mutate();
  };
  return (
    <>
      <PageTitle
        eyebrow="MY ACCOUNT"
        title="Tài khoản của tôi"
        detail="Chủ động cập nhật hồ sơ hiển thị, avatar, múi giờ và bảo mật đăng nhập."
        action={<StatusPill value={user.status} />}
      />
      <section className="profile-layout">
        <form className="panel p-6" onSubmit={save}>
          <div className="profile-preview">
            <Avatar name={displayName || user.display_name} size="xl" url={avatarUrl} />
            <div>
              <p className="eyebrow">PUBLIC PROFILE</p>
              <h2>{displayName || user.display_name}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="form-grid mt-6">
            <label className="field">
              <span>Họ và tên</span>
              <input
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>
            <label className="field">
              <span>Tên hiển thị</span>
              <input
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className="field form-span-2">
              <span>URL avatar (HTTP/HTTPS)</span>
              <input
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={avatarUrl}
              />
            </label>
            <label className="field form-span-2">
              <span>Múi giờ</span>
              <select onChange={(event) => setTimezone(event.target.value)} value={timezone}>
                <option>Asia/Ho_Chi_Minh</option>
                <option>Asia/Bangkok</option>
                <option>Asia/Singapore</option>
                <option>UTC</option>
              </select>
            </label>
          </div>
          {updateProfile.error && (
            <p className="notice error mt-4">{updateProfile.error.message}</p>
          )}
          {updateProfile.isSuccess && <p className="notice success mt-4">Đã cập nhật hồ sơ.</p>}
          <button className="button-primary mt-5" disabled={updateProfile.isPending} type="submit">
            Lưu hồ sơ
          </button>
        </form>
        <div className="space-y-6">
          <form className="panel p-6" onSubmit={savePassword}>
            <p className="eyebrow">SECURITY</p>
            <h2 className="mt-2 text-xl font-black">Đổi mật khẩu</h2>
            <label className="field mt-5">
              <span>Mật khẩu hiện tại</span>
              <input
                minLength={12}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </label>
            <label className="field mt-4">
              <span>Mật khẩu mới</span>
              <input
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            {changePassword.error && <p className="form-error">{changePassword.error.message}</p>}
            {changePassword.isSuccess && <p className="notice success mt-4">Đã đổi mật khẩu.</p>}
            <button
              className="button-secondary mt-5"
              disabled={changePassword.isPending}
              type="submit"
            >
              Cập nhật mật khẩu
            </button>
          </form>
          <div className="panel p-6">
            <p className="eyebrow">MEMBERSHIPS</p>
            <h2 className="mt-2 text-xl font-black">Tổ chức của tôi</h2>
            <div className="mt-4 space-y-3">
              {account.data.memberships.map((membership) => (
                <div className="membership-card" key={membership.organization_id}>
                  <div>
                    <strong>{membership.organization_name}</strong>
                    <p>@{membership.organization_slug}</p>
                  </div>
                  <StatusPill value={membership.role} />
                </div>
              ))}
              {account.data.memberships.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Bạn chưa thuộc tổ chức nào.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
