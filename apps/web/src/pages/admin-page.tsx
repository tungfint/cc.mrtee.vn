import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber, useSession } from '../lib/api';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusPill,
} from '../components/ui';

interface Membership {
  organization_id: string;
  organization_name: string;
  role: string;
}
interface Member {
  user_id: string;
  email: string;
  full_name: string;
  display_name: string;
  avatar_url: string | null;
  initial_cc_level: string;
  cc_level: string;
  codeforces_handle: string | null;
  pending_handle: string | null;
  verification_status: string | null;
  current_rating: number | null;
  codeforces_rank: string | null;
  sync_status: string | null;
  last_sync_at: string | null;
  role: string;
  status: string;
}
interface UserAccount {
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
  memberships: { organizationId: string; organizationName: string; role: string }[];
}
interface Organization {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  timezone: string;
  status: string;
  member_count: number;
  active_seasons: number;
}
interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  active: boolean;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const isSystemAdmin = session.data?.user.systemRole === 'SYSTEM_ADMIN';
  const [tab, setTab] = useState(isSystemAdmin ? 'accounts' : 'members');
  const [organizationId, setOrganizationId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [pointAmount, setPointAmount] = useState('10');
  const [pointReason, setPointReason] = useState('');
  const [baseAmount, setBaseAmount] = useState('800');
  const [baseReason, setBaseReason] = useState('');
  const [pointType, setPointType] = useState('BONUS');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('100');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [codeforcesHandle, setCodeforcesHandle] = useState('');
  const [initialCcLevel, setInitialCcLevel] = useState('800');
  const [classId, setClassId] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pointImportFile, setPointImportFile] = useState<File | null>(null);
  const [syncScope, setSyncScope] = useState<'USER' | 'ORGANIZATION' | 'ALL'>('USER');
  const [syncUserId, setSyncUserId] = useState('');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ memberships: Membership[] }>('/me'),
  });
  const organizations = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => api<{ organizations: Organization[] }>('/admin/organizations'),
    enabled: Boolean(isSystemAdmin),
  });
  useEffect(() => {
    if (organizationId) return;
    const firstMembership = me.data?.memberships[0]?.organization_id;
    const firstOrganization = organizations.data?.organizations[0]?.id;
    if (firstMembership || firstOrganization)
      setOrganizationId(firstMembership ?? firstOrganization ?? '');
  }, [me.data, organizationId, organizations.data]);
  const members = useQuery({
    queryKey: ['admin-members', organizationId],
    queryFn: () => api<{ members: Member[] }>(`/organizations/${organizationId}/members`),
    enabled: Boolean(organizationId),
  });
  const syncEligibleMembers =
    members.data?.members.filter(
      (member) => member.verification_status && member.verification_status !== 'UNVERIFIED',
    ) ?? [];
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<{ users: UserAccount[]; total: number }>('/admin/users?pageSize=50'),
    enabled: Boolean(isSystemAdmin),
  });
  const rewards = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: () => api<{ rewards: Reward[] }>('/admin/rewards'),
    enabled: Boolean(isSystemAdmin),
  });
  const audits = useQuery({
    queryKey: ['audits', organizationId],
    queryFn: () =>
      api<{
        logs: {
          id: string;
          action: string;
          actor_name: string | null;
          reason: string | null;
          created_at: string;
        }[];
      }>(`/admin/users/organization/${organizationId}/audit-logs`),
    enabled: Boolean(organizationId) && tab === 'audit',
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body: unknown;
    }) => api(path, { method, body: JSON.stringify(body) }),
    onSuccess: () => {
      for (const key of [
        'admin-members',
        'admin-users',
        'admin-organizations',
        'admin-rewards',
        'audits',
        'me',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      setReason('');
    },
  });
  const importStudents = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', importFile);
      return api<{
        created: number;
        failed: number;
        total: number;
        results: { row: number; email: string; success: boolean; message?: string }[];
      }>(`/organizations/${organizationId}/students/import`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    },
  });
  const importPoints = useMutation({
    mutationFn: async () => {
      if (!pointImportFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', pointImportFile);
      return api<{
        applied: number;
        replayed: number;
        failed: number;
        total: number;
        results: {
          row: number;
          email: string;
          success: boolean;
          replayed?: boolean;
          message?: string;
        }[];
      }>(`/admin/organizations/${organizationId}/points/import`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['audits'] }),
      ]);
    },
  });
  const synchronize = useMutation({
    mutationFn: () =>
      api<{ scope: string; matched: number; queued: number; skipped: number }>(
        '/admin/codeforces-sync',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: syncScope,
            ...(syncScope !== 'ALL' ? { organizationId } : {}),
            ...(syncScope === 'USER'
              ? {
                  targetUserId: syncUserId || syncEligibleMembers[0]?.user_id || '',
                }
              : {}),
          }),
        },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
  });
  if (me.isPending) return <LoadingState label="Đang kiểm tra quyền quản trị…" />;
  if (me.error) return <ErrorState error={me.error} />;
  const memberships =
    me.data?.memberships.filter(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role)) ?? [];
  const organizationOptions = isSystemAdmin
    ? (organizations.data?.organizations.map((item) => ({
        organization_id: item.id,
        organization_name: item.name,
        role: 'SYSTEM_ADMIN',
      })) ?? [])
    : memberships;
  const selectedOrganization = organizationOptions.find(
    (item) => item.organization_id === organizationId,
  );
  const canApproveHandle = isSystemAdmin || selectedOrganization?.role === 'ORG_ADMIN';
  const noOrganizationSelected =
    !organizationId && ['members', 'points', 'sync', 'audit'].includes(tab);
  const selectTarget = targetId || members.data?.members[0]?.user_id || '';
  const selectSyncTarget = syncUserId || syncEligibleMembers[0]?.user_id || '';
  const submitPoints = (event: FormEvent) => {
    event.preventDefault();
    if (!selectTarget) return;
    mutation.mutate({
      path: `/admin/users/${selectTarget}/points`,
      body: {
        organizationId,
        type: pointType,
        amount: Math.abs(Number(pointAmount)) * (pointType === 'PENALTY' ? -1 : 1),
        affectsSeason: true,
        reason: pointReason,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };
  const tabs = [
    ...(isSystemAdmin
      ? [
          { id: 'accounts', label: 'Tài khoản' },
          { id: 'organizations', label: 'Lớp học' },
        ]
      : []),
    { id: 'members', label: 'Học sinh' },
    { id: 'points', label: 'Điểm & CC Base' },
    { id: 'sync', label: 'Đồng bộ CF' },
    { id: 'audit', label: 'Nhật ký' },
    ...(isSystemAdmin ? [{ id: 'rewards', label: 'Phần thưởng' }] : []),
  ];
  return (
    <>
      <PageTitle
        eyebrow="CONTROL ROOM"
        title="Quản trị Cầy Code"
        detail="Quản lý tài khoản, lớp học, học sinh và nền kinh tế CC Point trong một nơi."
        action={
          <select
            aria-label="Lớp quản trị"
            onChange={(event) => setOrganizationId(event.target.value)}
            value={organizationId}
          >
            {organizationOptions.map((item) => (
              <option key={item.organization_id} value={item.organization_id}>
                {item.organization_name} · {item.role}
              </option>
            ))}
          </select>
        }
      />
      {memberships.length === 0 && !isSystemAdmin ? (
        <EmptyState
          title="Không có quyền quản trị"
          detail="Bạn cần vai trò Teacher hoặc Org Admin."
        />
      ) : (
        <>
          <div className="tabs">
            {tabs.map((item) => (
              <button
                className={tab === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          {mutation.error && <p className="notice error">{mutation.error.message}</p>}
          {mutation.isSuccess && (
            <p className="notice success">Thao tác đã hoàn tất và được audit.</p>
          )}
          {noOrganizationSelected && (
            <EmptyState
              title="Chưa có lớp học"
              detail="Hãy mở tab Lớp học và tạo lớp đầu tiên trước khi quản lý học sinh."
            />
          )}
          {tab === 'accounts' && isSystemAdmin && (
            <section className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: '/admin/users',
                      body: {
                        email,
                        password,
                        fullName,
                        displayName,
                        systemRole: 'USER',
                        initialCcLevel: Number(initialCcLevel),
                        ...(classId ? { organizationId: classId } : {}),
                        ...(codeforcesHandle ? { codeforcesHandle } : {}),
                      },
                    });
                  }}
                >
                  <p className="eyebrow">NEW ACCOUNT</p>
                  <h2 className="mt-2 text-xl font-black">Tạo tài khoản học sinh</h2>
                  <div className="form-grid mt-5">
                    <label className="field">
                      <span>Email</span>
                      <input
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        type="email"
                        value={email}
                      />
                    </label>
                    <label className="field">
                      <span>Mật khẩu tạm</span>
                      <input
                        minLength={12}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        type="password"
                        value={password}
                      />
                    </label>
                    <label className="field">
                      <span>Họ và tên</span>
                      <input
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        value={fullName}
                      />
                    </label>
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <input
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        value={displayName}
                      />
                    </label>
                    <label className="field">
                      <span>Tài khoản Codeforces</span>
                      <input
                        onChange={(e) => setCodeforcesHandle(e.target.value)}
                        pattern="[A-Za-z0-9_.-]{3,24}"
                        placeholder="Có thể để trống"
                        value={codeforcesHandle}
                      />
                    </label>
                    <label className="field">
                      <span>Mức ban đầu</span>
                      <input
                        max="10000"
                        min="0"
                        onChange={(e) => setInitialCcLevel(e.target.value)}
                        required
                        type="number"
                        value={initialCcLevel}
                      />
                    </label>
                    <label className="field form-span-2">
                      <span>Lớp của học sinh</span>
                      <select onChange={(e) => setClassId(e.target.value)} value={classId}>
                        <option value="">Chưa xếp lớp</option>
                        {organizations.data?.organizations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    Tạo tài khoản
                  </button>
                </form>
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: `/admin/users/${resetUserId}/reset-password`,
                      body: { password: resetPassword, reason: reason || 'Admin đặt lại mật khẩu' },
                    });
                  }}
                >
                  <p className="eyebrow">SECURITY COMMAND</p>
                  <h2 className="mt-2 text-xl font-black">Đặt lại mật khẩu</h2>
                  <label className="field mt-5">
                    <span>Tài khoản</span>
                    <select
                      onChange={(e) => setResetUserId(e.target.value)}
                      required
                      value={resetUserId}
                    >
                      <option value="">Chọn tài khoản</option>
                      {users.data?.users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.display_name} · {item.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field mt-4">
                    <span>Mật khẩu mới</span>
                    <input
                      minLength={12}
                      onChange={(e) => setResetPassword(e.target.value)}
                      required
                      type="password"
                      value={resetPassword}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Lý do</span>
                    <textarea onChange={(e) => setReason(e.target.value)} value={reason} />
                  </label>
                  <button className="button-secondary mt-5" type="submit">
                    Đặt lại & đăng xuất các phiên
                  </button>
                </form>
              </div>
              {editingUser && (
                <form
                  className="panel p-6"
                  key={editingUser.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const field = (name: string) => {
                      const value = form.get(name);
                      return typeof value === 'string' ? value : '';
                    };
                    const nextHandle = field('codeforcesHandle').trim();
                    mutation.mutate({
                      path: `/admin/users/${editingUser.id}`,
                      method: 'PATCH',
                      body: {
                        email: field('email'),
                        fullName: field('fullName'),
                        displayName: field('displayName'),
                        initialCcLevel: Number(field('initialCcLevel')),
                        classId: field('classId') || null,
                        ...(nextHandle ? { codeforcesHandle: nextHandle } : {}),
                        reason: field('reason'),
                      },
                    });
                  }}
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">EDIT STUDENT</p>
                      <h2>Sửa thông tin học sinh</h2>
                    </div>
                    <button
                      className="button-secondary"
                      onClick={() => setEditingUser(null)}
                      type="button"
                    >
                      Đóng
                    </button>
                  </div>
                  <div className="form-grid mt-5">
                    <label className="field">
                      <span>Email đăng nhập</span>
                      <input defaultValue={editingUser.email} name="email" required type="email" />
                    </label>
                    <label className="field">
                      <span>Họ và tên</span>
                      <input defaultValue={editingUser.full_name} name="fullName" required />
                    </label>
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <input defaultValue={editingUser.display_name} name="displayName" required />
                    </label>
                    <label className="field">
                      <span>Mức ban đầu</span>
                      <input
                        defaultValue={editingUser.initial_cc_level ?? '800'}
                        max="10000"
                        min="0"
                        name="initialCcLevel"
                        required
                        type="number"
                      />
                    </label>
                    <label className="field">
                      <span>Tài khoản Codeforces</span>
                      <input
                        defaultValue={editingUser.codeforces_handle ?? ''}
                        name="codeforcesHandle"
                        pattern="[A-Za-z0-9_.-]{3,24}"
                        placeholder="Chưa liên kết"
                      />
                    </label>
                    <label className="field">
                      <span>Lớp của học sinh</span>
                      <select
                        defaultValue={
                          editingUser.memberships.find(({ role }) => role === 'MEMBER')
                            ?.organizationId ?? ''
                        }
                        name="classId"
                      >
                        <option value="">Chưa xếp lớp</option>
                        {organizations.data?.organizations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field form-span-2">
                      <span>Lý do cập nhật</span>
                      <textarea
                        defaultValue="Admin cập nhật hồ sơ học sinh"
                        minLength={3}
                        name="reason"
                        required
                      />
                    </label>
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    Lưu thông tin học sinh
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>{users.data?.total ?? 0} tài khoản</strong>
                  <span>Trạng thái và quyền hệ thống</span>
                </div>
                {users.isPending ? (
                  <LoadingState label="Đang tải tài khoản…" />
                ) : (
                  users.data?.users.map((item) => (
                    <div className="account-row" key={item.id}>
                      <div className="member">
                        <Avatar
                          name={item.display_name}
                          rating={item.current_rating}
                          size="sm"
                          url={item.avatar_url}
                        />
                        <div>
                          <strong>{item.display_name}</strong>
                          <p>
                            {item.email} · CC Base {item.initial_cc_level ?? '800'} ·{' '}
                            {item.memberships.length} lớp
                          </p>
                          {item.codeforces_handle && (
                            <CodeforcesHandle
                              handle={item.codeforces_handle}
                              rating={item.current_rating}
                            />
                          )}
                          {item.pending_handle && (
                            <p className="pending-copy">Chờ duyệt: @{item.pending_handle}</p>
                          )}
                        </div>
                      </div>
                      <select
                        aria-label={`Trạng thái ${item.display_name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/admin/users/${item.id}`,
                            method: 'PATCH',
                            body: {
                              status: e.target.value,
                              reason: 'Cập nhật trạng thái từ trang quản trị',
                            },
                          })
                        }
                        value={item.status}
                      >
                        <option>ACTIVE</option>
                        <option>INACTIVE</option>
                        <option>SUSPENDED</option>
                      </select>
                      <select
                        aria-label={`Quyền ${item.display_name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/admin/users/${item.id}`,
                            method: 'PATCH',
                            body: {
                              systemRole: e.target.value,
                              reason: 'Cập nhật quyền hệ thống từ trang quản trị',
                            },
                          })
                        }
                        value={item.system_role}
                      >
                        <option>USER</option>
                        <option>SYSTEM_ADMIN</option>
                      </select>
                      <button
                        className="button-secondary"
                        onClick={() => setEditingUser(item)}
                        type="button"
                      >
                        Sửa
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'organizations' && isSystemAdmin && (
            <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/organizations',
                    body: {
                      name: organizationName,
                      slug: organizationSlug,
                      visibility: 'PRIVATE',
                      timezone: 'Asia/Ho_Chi_Minh',
                    },
                  });
                }}
              >
                <p className="eyebrow">NEW ORGANIZATION</p>
                <h2 className="mt-2 text-xl font-black">Tạo lớp học</h2>
                <label className="field mt-5">
                  <span>Tên lớp học</span>
                  <input
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                    value={organizationName}
                  />
                </label>
                <label className="field mt-4">
                  <span>Slug</span>
                  <input
                    onChange={(e) =>
                      setOrganizationSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                    }
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    required
                    value={organizationSlug}
                  />
                </label>
                <button className="button-primary mt-5" type="submit">
                  Tạo lớp học
                </button>
              </form>
              <div className="panel overflow-hidden">
                {organizations.data?.organizations.map((item) => (
                  <div className="organization-row" key={item.id}>
                    <div>
                      <input
                        aria-label={`Tên tổ chức ${item.name}`}
                        className="inline-name-input"
                        defaultValue={item.name}
                        onBlur={(event) => {
                          if (event.target.value === item.name) return;
                          mutation.mutate({
                            path: `/admin/organizations/${item.id}`,
                            method: 'PATCH',
                            body: {
                              name: event.target.value,
                              reason: 'Cập nhật tên tổ chức',
                            },
                          });
                        }}
                      />
                      <p>
                        @{item.slug} · {item.member_count} thành viên · {item.active_seasons} mùa
                        active
                      </p>
                    </div>
                    <select
                      aria-label={`Hiển thị ${item.name}`}
                      onChange={(e) =>
                        mutation.mutate({
                          path: `/admin/organizations/${item.id}`,
                          method: 'PATCH',
                          body: { visibility: e.target.value, reason: 'Cập nhật hiển thị tổ chức' },
                        })
                      }
                      value={item.visibility}
                    >
                      <option>PUBLIC</option>
                      <option>CLOSED</option>
                      <option>PRIVATE</option>
                    </select>
                    <select
                      aria-label={`Trạng thái ${item.name}`}
                      onChange={(e) =>
                        mutation.mutate({
                          path: `/admin/organizations/${item.id}`,
                          method: 'PATCH',
                          body: { status: e.target.value, reason: 'Cập nhật trạng thái tổ chức' },
                        })
                      }
                      value={item.status}
                    >
                      <option>ACTIVE</option>
                      <option>INACTIVE</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === 'members' && !noOrganizationSelected && (
            <section className="space-y-4">
              <form
                className="panel import-panel p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  importStudents.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK IMPORT</p>
                  <h2 className="mt-2 text-xl font-black">Import danh sách học sinh</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Nhận CSV/XLSX, tối đa 500 học sinh. Tài khoản được thêm trực tiếp vào lớp đang
                    chọn.
                  </p>
                  <a
                    className="template-link"
                    download
                    href="/templates/danh-sach-hoc-sinh-mau.csv"
                  >
                    ⇩ Tải file mẫu CSV
                  </a>
                </div>
                <label className="field">
                  <span>File danh sách</span>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={!organizationId || importStudents.isPending}
                  type="submit"
                >
                  {importStudents.isPending ? 'Đang import…' : 'Import vào lớp'}
                </button>
              </form>
              {importStudents.error && (
                <p className="notice error">{importStudents.error.message}</p>
              )}
              {importStudents.data && (
                <div className="notice success import-result">
                  <strong>
                    Đã tạo {importStudents.data.created}/{importStudents.data.total} học sinh.
                  </strong>
                  {importStudents.data.failed > 0 && (
                    <ul>
                      {importStudents.data.results
                        .filter(({ success }) => !success)
                        .map((result) => (
                          <li key={`${result.row}-${result.email}`}>
                            Dòng {result.row} · {result.email || 'không có tài khoản'}:{' '}
                            {result.message}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              {isSystemAdmin && (
                <form
                  className="panel member-add-form p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: `/organizations/${organizationId}/members`,
                      body: { userId: memberUserId, role: memberRole },
                    });
                  }}
                >
                  <label className="field">
                    <span>Thêm tài khoản vào lớp</span>
                    <select
                      onChange={(event) => setMemberUserId(event.target.value)}
                      required
                      value={memberUserId}
                    >
                      <option value="">Chọn tài khoản</option>
                      {users.data?.users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.display_name} · {item.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Vai trò trong lớp</span>
                    <select
                      onChange={(event) => setMemberRole(event.target.value)}
                      value={memberRole}
                    >
                      <option>MEMBER</option>
                      <option>TEACHER</option>
                      <option>ORG_ADMIN</option>
                    </select>
                  </label>
                  <button className="button-primary" type="submit">
                    Thêm vào lớp
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                {members.isPending ? (
                  <LoadingState label="Đang tải thành viên…" />
                ) : !members.data?.members.length ? (
                  <EmptyState
                    title="Chưa có học sinh"
                    detail="Thêm từng tài khoản hoặc import danh sách CSV/XLSX."
                  />
                ) : (
                  members.data.members.map((member) => (
                    <div className="admin-row student-row" key={member.user_id}>
                      <div className="member">
                        <Avatar
                          name={member.display_name}
                          rating={member.current_rating}
                          size="sm"
                          url={member.avatar_url}
                        />
                        <div>
                          <strong>{member.display_name}</strong>
                          <p>
                            {member.full_name} · {member.email}
                          </p>
                          <p>
                            CC Base {member.initial_cc_level ?? '800'} · CC Level{' '}
                            {member.cc_level ?? '800'}
                          </p>
                          {member.codeforces_handle && (
                            <CodeforcesHandle
                              handle={member.codeforces_handle}
                              rating={member.current_rating}
                            />
                          )}
                          {member.pending_handle && (
                            <p className="pending-copy">Yêu cầu đổi: @{member.pending_handle}</p>
                          )}
                        </div>
                      </div>
                      <StatusPill value={member.status} />
                      <select
                        aria-label={`Vai trò ${member.display_name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/organizations/${organizationId}/members/${member.user_id}`,
                            method: 'PATCH',
                            body: {
                              role: e.target.value,
                              reason: 'Cập nhật vai trò từ trang quản trị',
                            },
                          })
                        }
                        value={member.role}
                      >
                        <option>MEMBER</option>
                        <option>TEACHER</option>
                        <option>ORG_ADMIN</option>
                      </select>
                      <div className="student-actions">
                        {member.pending_handle && canApproveHandle ? (
                          <>
                            <button
                              className="button-primary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/approve-change`,
                                  body: { reason: reason || 'Admin duyệt đổi Codeforces handle' },
                                })
                              }
                              type="button"
                            >
                              Duyệt đổi CF
                            </button>
                            <button
                              className="button-secondary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/reject-change`,
                                  body: { reason: reason || 'Admin từ chối đổi Codeforces handle' },
                                })
                              }
                              type="button"
                            >
                              Từ chối
                            </button>
                          </>
                        ) : member.verification_status === 'UNVERIFIED' ? (
                          <button
                            className="button-secondary"
                            onClick={() =>
                              mutation.mutate({
                                path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/verify`,
                                body: { reason: reason || 'Xác minh trực tiếp bởi giáo viên' },
                              })
                            }
                            type="button"
                          >
                            Xác minh CF
                          </button>
                        ) : member.verification_status ? (
                          <StatusPill value={member.verification_status} />
                        ) : (
                          <span className="text-xs text-[var(--muted)]">Chưa có Codeforces</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'points' && !noOrganizationSelected && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <form className="panel p-6" onSubmit={submitPoints}>
                  <p className="eyebrow">CC POINT COMMAND</p>
                  <h2 className="mt-2 text-xl font-black">Cộng / trừ một tài khoản</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Ghi trực tiếp vào ví CC Point và điểm mùa hiện tại. Mỗi lệnh có khóa chống ghi
                    trùng và được lưu trong nhật ký.
                  </p>
                  <label className="field mt-5">
                    <span>Học sinh</span>
                    <select onChange={(e) => setTargetId(e.target.value)} value={selectTarget}>
                      {members.data?.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Loại</span>
                      <select onChange={(e) => setPointType(e.target.value)} value={pointType}>
                        <option value="BONUS">CỘNG</option>
                        <option value="PENALTY">TRỪ</option>
                        <option value="ADJUSTMENT">ĐIỀU CHỈNH</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>CC Point</span>
                      <input
                        min="0.01"
                        onChange={(e) => setPointAmount(e.target.value)}
                        required
                        step="0.01"
                        type="number"
                        value={pointAmount}
                      />
                    </label>
                  </div>
                  <label className="field mt-4">
                    <span>Lý do bắt buộc</span>
                    <textarea
                      minLength={3}
                      onChange={(e) => setPointReason(e.target.value)}
                      required
                      value={pointReason}
                    />
                  </label>
                  <button className="button-primary mt-5" disabled={!selectTarget} type="submit">
                    Ghi giao dịch
                  </button>
                </form>

                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: `/admin/users/${selectTarget}/recalibrate-base`,
                      body: { organizationId, ccBase: Number(baseAmount), reason: baseReason },
                    });
                  }}
                >
                  <p className="eyebrow">SKILL CALIBRATION</p>
                  <h2 className="mt-2 text-xl font-black">Hiệu chỉnh CC Base</h2>
                  <div className="base-explanation mt-4">
                    <p>
                      <strong>CC Base</strong> là mức năng lực nền do Admin/Giáo viên xác nhận từ
                      đầu vào, bài kiểm tra hoặc lịch sử Codeforces. Đây không phải điểm thưởng và
                      không cộng trực tiếp vào ví.
                    </p>
                    <p>
                      <strong>
                        CC Level hiện tại = giá trị lớn hơn giữa CC Base và mức hệ thống tính từ bài
                        đã giải.
                      </strong>{' '}
                      Hạ CC Base không làm mất kết quả năng lực đã đạt được.
                    </p>
                  </div>
                  <div className="base-presets mt-4" aria-label="Các mốc CC Base đề xuất">
                    {[
                      [800, 'Mới bắt đầu'],
                      [1000, 'Có nền tảng'],
                      [1200, 'Khá'],
                      [1400, 'Vững'],
                      [1600, 'Nâng cao'],
                      [1900, 'Chuyên sâu'],
                    ].map(([level, label]) => (
                      <button
                        className={baseAmount === String(level) ? 'active' : ''}
                        key={level}
                        onClick={() => setBaseAmount(String(level))}
                        type="button"
                      >
                        <strong>{level}</strong>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <label className="field mt-5">
                    <span>CC Base mới</span>
                    <input
                      max="10000"
                      min="0"
                      onChange={(e) => setBaseAmount(e.target.value)}
                      required
                      type="number"
                      value={baseAmount}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Lý do và căn cứ hiệu chỉnh</span>
                    <textarea
                      minLength={3}
                      onChange={(e) => setBaseReason(e.target.value)}
                      placeholder="Ví dụ: Kết quả kiểm tra đầu vào ngày…"
                      required
                      value={baseReason}
                    />
                  </label>
                  <button className="button-secondary mt-5" disabled={!selectTarget} type="submit">
                    Hiệu chỉnh CC Base
                  </button>
                </form>
              </div>

              <form
                className="panel import-panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  importPoints.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK CC POINT</p>
                  <h2 className="mt-2 text-xl font-black">Cộng / trừ hàng loạt</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Nhận CSV hoặc XLSX, tối đa 500 tài khoản. Cột thao tác dùng CỘNG/TRỪ; CC Point
                    luôn nhập số dương. Tải lại cùng một file sẽ không ghi trùng giao dịch đã thành
                    công.
                  </p>
                </div>
                <div className="import-actions">
                  <a
                    className="button-secondary"
                    download
                    href="/templates/cong-tru-cc-point-mau.csv"
                  >
                    ↓ Tải file mẫu
                  </a>
                  <label className="button-secondary avatar-file-button">
                    Chọn CSV / XLSX
                    <input
                      accept=".csv,.xlsx"
                      onChange={(event) => setPointImportFile(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                  <span className="import-filename">
                    {pointImportFile?.name ?? 'Chưa chọn file'}
                  </span>
                  <button
                    className="button-primary"
                    disabled={!pointImportFile || importPoints.isPending}
                    type="submit"
                  >
                    {importPoints.isPending ? 'Đang xử lý…' : 'Thực hiện hàng loạt'}
                  </button>
                </div>
                {importPoints.error && <p className="notice error">{importPoints.error.message}</p>}
                {importPoints.data && (
                  <div className="import-result">
                    <strong>
                      Đã ghi {importPoints.data.applied} · Bỏ qua trùng {importPoints.data.replayed}{' '}
                      · Lỗi {importPoints.data.failed}
                    </strong>
                    {importPoints.data.results
                      .filter((item) => !item.success)
                      .slice(0, 12)
                      .map((item) => (
                        <p key={`${item.row}-${item.email}`}>
                          Dòng {item.row} · {item.email || 'trống'}: {item.message}
                        </p>
                      ))}
                  </div>
                )}
              </form>
            </div>
          )}
          {tab === 'sync' && !noOrganizationSelected && (
            <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  synchronize.mutate();
                }}
              >
                <p className="eyebrow">CODEFORCES SYNC CONTROL</p>
                <h2 className="mt-2 text-xl font-black">Chọn phạm vi đồng bộ</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Chỉ các tài khoản Codeforces đã xác minh và đang hoạt động mới được đưa vào hàng
                  đợi. Tài khoản đã có job chờ sẽ được bỏ qua để tránh chạy trùng.
                </p>
                <label className="field mt-5">
                  <span>Phạm vi</span>
                  <select
                    onChange={(event) =>
                      setSyncScope(event.target.value as 'USER' | 'ORGANIZATION' | 'ALL')
                    }
                    value={syncScope}
                  >
                    <option value="USER">Một tài khoản</option>
                    <option value="ORGANIZATION">Cả lớp đang chọn</option>
                    {isSystemAdmin && <option value="ALL">Toàn hệ thống</option>}
                  </select>
                </label>
                {syncScope === 'USER' && (
                  <label className="field mt-4">
                    <span>Tài khoản</span>
                    <select
                      onChange={(event) => setSyncUserId(event.target.value)}
                      value={selectSyncTarget}
                    >
                      {syncEligibleMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name} · {member.codeforces_handle ?? 'chưa có CF'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {syncScope !== 'ALL' && (
                  <p className="notice pending mt-4">
                    Lớp: <strong>{selectedOrganization?.organization_name}</strong>
                  </p>
                )}
                <button
                  className="button-primary mt-5"
                  disabled={synchronize.isPending || (syncScope === 'USER' && !selectSyncTarget)}
                  type="submit"
                >
                  {synchronize.isPending ? 'Đang xếp hàng…' : 'Bắt đầu đồng bộ'}
                </button>
                {synchronize.error && (
                  <p className="notice error mt-4">{synchronize.error.message}</p>
                )}
                {synchronize.data && (
                  <div className="sync-result mt-4">
                    <strong>{synchronize.data.queued} tài khoản đã vào hàng đợi</strong>
                    <p>
                      Tìm thấy {synchronize.data.matched} · Bỏ qua {synchronize.data.skipped}
                    </p>
                  </div>
                )}
              </form>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Trạng thái lớp</strong>
                  <span>{selectedOrganization?.organization_name}</span>
                </div>
                {members.data?.members.map((member) => (
                  <div className="sync-account-row" key={member.user_id}>
                    <div className="member">
                      <Avatar
                        name={member.display_name}
                        rating={member.current_rating}
                        size="sm"
                        url={member.avatar_url}
                      />
                      <div>
                        <strong>{member.display_name}</strong>
                        <p>@{member.codeforces_handle ?? 'Chưa liên kết Codeforces'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusPill value={member.sync_status ?? 'UNLINKED'} />
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {member.last_sync_at
                          ? `Lần cuối ${formatDate(member.last_sync_at)}`
                          : 'Chưa đồng bộ'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === 'audit' && !noOrganizationSelected && (
            <div className="panel overflow-hidden">
              {audits.isPending ? (
                <LoadingState label="Đang tải audit…" />
              ) : audits.error ? (
                <ErrorState error={audits.error} />
              ) : !audits.data?.logs.length ? (
                <EmptyState
                  title="Chưa có audit log"
                  detail="Các lệnh đặc quyền sẽ xuất hiện tại đây."
                />
              ) : (
                audits.data.logs.map((log) => (
                  <div className="audit-row" key={log.id}>
                    <div>
                      <strong>{log.action.replaceAll('_', ' ')}</strong>
                      <p>{log.reason ?? 'Không có ghi chú'}</p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{log.actor_name ?? 'System'}</p>
                      <p>{formatDate(log.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'rewards' && isSystemAdmin && (
            <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/admin/rewards',
                    body: {
                      name: rewardName,
                      description: reason || 'Phần thưởng từ Cầy Code MrTee.vn',
                      cost: Number(rewardCost),
                      stock: null,
                      active: true,
                      imageUrl: null,
                    },
                  });
                }}
              >
                <p className="eyebrow">CATALOG</p>
                <h2 className="mt-2 text-xl font-black">Tạo phần thưởng</h2>
                <label className="field mt-5">
                  <span>Tên</span>
                  <input
                    onChange={(e) => setRewardName(e.target.value)}
                    required
                    value={rewardName}
                  />
                </label>
                <label className="field mt-4">
                  <span>Chi phí CC Point</span>
                  <input
                    min="0.01"
                    onChange={(e) => setRewardCost(e.target.value)}
                    type="number"
                    value={rewardCost}
                  />
                </label>
                <label className="field mt-4">
                  <span>Mô tả</span>
                  <textarea onChange={(e) => setReason(e.target.value)} required value={reason} />
                </label>
                <button className="button-primary mt-5" type="submit">
                  Tạo phần thưởng
                </button>
              </form>
              <div className="panel overflow-hidden">
                {rewards.data?.rewards.map((reward) => (
                  <div className="admin-row" key={reward.id}>
                    <div>
                      <strong>{reward.name}</strong>
                      <p className="m-0 text-xs text-[var(--muted)]">
                        {formatNumber(reward.cost, 2)} CC Point · {reward.stock ?? '∞'} suất
                      </p>
                    </div>
                    <StatusPill value={reward.active ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
