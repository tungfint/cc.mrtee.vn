import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { AvatarUploader } from '../components/avatar-uploader';
import {
  CodeforcesHandle,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusPill,
} from '../components/ui';
import { api } from '../lib/api';

interface AccountData {
  user: {
    id: string;
    email: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    status: string;
    system_role: string;
    initial_cc_level: string;
    cc_level: string;
    codeforces_handle: string | null;
    pending_handle: string | null;
    verification_status: string | null;
    current_rating: number | null;
    rank: string | null;
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
  const [codeforcesHandle, setCodeforcesHandle] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  useEffect(() => {
    if (!account.data) return;
    setFullName(account.data.user.full_name);
    setDisplayName(account.data.user.display_name);
    setCodeforcesHandle(
      account.data.user.pending_handle ?? account.data.user.codeforces_handle ?? '',
    );
  }, [account.data]);
  const invalidateProfile = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['session'] }),
    ]);
  };
  const updateProfile = useMutation({
    mutationFn: () =>
      api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, displayName }),
      }),
    onSuccess: invalidateProfile,
  });
  const updateCodeforces = useMutation({
    mutationFn: () =>
      api('/me/codeforces-account', {
        method: 'POST',
        body: JSON.stringify({ handle: codeforcesHandle }),
      }),
    onSuccess: invalidateProfile,
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
  const classes = account.data.memberships.filter(({ role }) => role === 'MEMBER');
  return (
    <>
      <PageTitle
        eyebrow="MY ACCOUNT"
        title="Tài khoản của tôi"
        detail="Quản lý hồ sơ, ảnh đại diện, lớp học, Codeforces và bảo mật đăng nhập."
        action={<StatusPill value={user.status} />}
      />
      <section className="profile-layout">
        <div className="space-y-6">
          <div className="panel p-6">
            <AvatarUploader
              currentUrl={user.avatar_url}
              name={displayName || user.display_name}
              rating={user.current_rating}
            />
            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                updateProfile.mutate();
              }}
            >
              <div className="form-grid">
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
              </div>
              {updateProfile.error && (
                <p className="notice error mt-4">{updateProfile.error.message}</p>
              )}
              {updateProfile.isSuccess && <p className="notice success mt-4">Đã cập nhật hồ sơ.</p>}
              <button
                className="button-primary mt-5"
                disabled={updateProfile.isPending}
                type="submit"
              >
                Lưu hồ sơ
              </button>
            </form>
          </div>

          <form
            className="panel p-6"
            onSubmit={(event) => {
              event.preventDefault();
              updateCodeforces.mutate();
            }}
          >
            <p className="eyebrow">CODEFORCES</p>
            <div className="section-heading mt-2">
              <div>
                <h2>Tài khoản Codeforces</h2>
                {user.codeforces_handle ? (
                  <CodeforcesHandle handle={user.codeforces_handle} rating={user.current_rating} />
                ) : (
                  <p className="text-sm text-[var(--muted)]">Chưa liên kết</p>
                )}
              </div>
              {user.verification_status && <StatusPill value={user.verification_status} />}
            </div>
            {user.pending_handle && (
              <p className="notice pending mt-4">
                Đang chờ Admin duyệt đổi sang <strong>@{user.pending_handle}</strong>. Tài khoản cũ
                vẫn hoạt động cho đến khi được duyệt.
              </p>
            )}
            <label className="field mt-5">
              <span>
                {user.codeforces_handle ? 'Đề nghị đổi Codeforces handle' : 'Codeforces handle'}
              </span>
              <input
                onChange={(event) => setCodeforcesHandle(event.target.value)}
                pattern="[A-Za-z0-9_.-]{3,24}"
                required
                value={codeforcesHandle}
              />
            </label>
            <p className="field-help">
              Khi thay đổi tài khoản đã xác minh, yêu cầu phải được Admin của lớp phê duyệt.
            </p>
            {updateCodeforces.error && (
              <p className="notice error mt-4">{updateCodeforces.error.message}</p>
            )}
            {updateCodeforces.isSuccess && (
              <p className="notice success mt-4">
                {user.codeforces_handle
                  ? 'Đã gửi yêu cầu cho Admin.'
                  : 'Đã liên kết, đang chờ xác minh.'}
              </p>
            )}
            <button
              className="button-secondary mt-5"
              disabled={updateCodeforces.isPending}
              type="submit"
            >
              {user.codeforces_handle ? 'Gửi yêu cầu thay đổi' : 'Liên kết Codeforces'}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <p className="eyebrow">STUDENT PROFILE</p>
            <h2 className="mt-2 text-xl font-black">Thông tin học sinh</h2>
            <dl className="profile-facts mt-5">
              <div>
                <dt>Email đăng nhập</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Mức ban đầu</dt>
                <dd>{user.initial_cc_level ?? '800'} CC Level</dd>
              </div>
              <div>
                <dt>CC Level hiện tại</dt>
                <dd>{user.cc_level ?? '800'}</dd>
              </div>
            </dl>
            <h3 className="mt-6 text-sm font-black">Lớp của học sinh</h3>
            <div className="mt-3 space-y-3">
              {classes.map((membership) => (
                <div className="membership-card" key={membership.organization_id}>
                  <div>
                    <strong>{membership.organization_name}</strong>
                    <p>@{membership.organization_slug}</p>
                  </div>
                  <StatusPill value={membership.role} />
                </div>
              ))}
              {classes.length === 0 && (
                <p className="text-sm text-[var(--muted)]">Chưa được xếp lớp.</p>
              )}
            </div>
          </div>

          <form
            className="panel p-6"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              changePassword.mutate();
            }}
          >
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
        </div>
      </section>
    </>
  );
}
