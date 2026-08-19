import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber, formatVnd, useSession } from '../lib/api';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  StatusPill,
} from '../components/ui';
import { RewardImageUploader } from '../components/reward-image-uploader';

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
  cc_point: string;
  cc_balance: string;
  must_change_password: boolean;
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
  image_url: string | null;
  cash_value_vnd: number | null;
}
interface RewardOrder {
  id: string;
  display_name: string;
  full_name: string;
  reward_name: string;
  cost_snapshot: string;
  cash_value_vnd: number | null;
  status: string;
  note: string | null;
  created_at: string;
}
interface LeaderboardLink {
  id: string;
  public_key: string;
  organization_id: string | null;
  organization_name: string | null;
  active: boolean;
  created_at: string;
}
interface MotivationalQuote {
  id: string;
  content: string;
  author: string | null;
  active: boolean;
  sort_order: number;
}
interface LevelRank {
  id: string;
  min_level: number;
  name: string;
  icon: string;
  color: string;
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
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardStock, setRewardStock] = useState('');
  const [rewardImageUrl, setRewardImageUrl] = useState('');
  const [rewardActive, setRewardActive] = useState(true);
  const [rewardCashValue, setRewardCashValue] = useState('');
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [quoteContent, setQuoteContent] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [quoteOrder, setQuoteOrder] = useState('0');
  const [quoteActive, setQuoteActive] = useState(true);
  const [editingQuote, setEditingQuote] = useState<MotivationalQuote | null>(null);
  const [rankMinLevel, setRankMinLevel] = useState('800');
  const [rankName, setRankName] = useState('');
  const [rankIcon, setRankIcon] = useState('🏅');
  const [rankColor, setRankColor] = useState('#22d3ee');
  const [rankActive, setRankActive] = useState(true);
  const [editingRank, setEditingRank] = useState<LevelRank | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [codeforcesHandle, setCodeforcesHandle] = useState('');
  const [initialCcLevel, setInitialCcLevel] = useState('800');
  const [classId, setClassId] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pointImportFile, setPointImportFile] = useState<File | null>(null);
  const [quoteImportFile, setQuoteImportFile] = useState<File | null>(null);
  const [leaderboardScope, setLeaderboardScope] = useState<'ALL' | 'ORGANIZATION'>('ALL');
  const [leaderboardOrganizationId, setLeaderboardOrganizationId] = useState('');
  const [syncScope, setSyncScope] = useState<'USER' | 'ORGANIZATION' | 'ALL'>('USER');
  const [syncUserId, setSyncUserId] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
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
    const firstOrganization = organizations.data?.organizations.find(
      ({ status }) => status === 'ACTIVE',
    )?.id;
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
  const verifiableMembers =
    members.data?.members.filter(
      (member) => member.codeforces_handle && member.verification_status === 'UNVERIFIED',
    ) ?? [];
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<{ users: UserAccount[]; total: number }>('/admin/users?pageSize=500'),
    enabled: Boolean(isSystemAdmin),
  });
  const rewards = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: () => api<{ rewards: Reward[] }>('/admin/rewards'),
    enabled: Boolean(isSystemAdmin),
  });
  const rewardOrders = useQuery({
    queryKey: ['admin-reward-orders'],
    queryFn: () => api<{ orders: RewardOrder[] }>('/admin/rewards/orders'),
    enabled: Boolean(isSystemAdmin),
  });
  const leaderboardLinks = useQuery({
    queryKey: ['admin-leaderboard-links'],
    queryFn: () => api<{ links: LeaderboardLink[] }>('/admin/leaderboard-links'),
    enabled: Boolean(isSystemAdmin),
  });
  const content = useQuery({
    queryKey: ['admin-content'],
    queryFn: () => api<{ quotes: MotivationalQuote[]; ranks: LevelRank[] }>('/admin/content'),
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
        'admin-content',
        'admin-reward-orders',
        'admin-leaderboard-links',
        'dashboard-content',
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
      }>(
        isSystemAdmin ? '/admin/users/import' : `/organizations/${organizationId}/students/import`,
        {
          method: 'POST',
          body: form,
        },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    },
  });
  const importQuotes = useMutation({
    mutationFn: async () => {
      if (!quoteImportFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', quoteImportFile);
      return api<{ created: number; failed: number; total: number }>('/admin/quotes/import', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-content'] }),
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
  const verifyStudents = useMutation({
    mutationFn: (userIds: string[]) =>
      api<{ requested: number; verified: number; skipped: number }>(
        '/admin/codeforces-accounts/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            userIds,
            reason: reason || 'Admin xác minh Codeforces hàng loạt',
            ...(!isSystemAdmin && organizationId ? { organizationId } : {}),
          }),
        },
      ),
    onSuccess: async () => {
      setSelectedStudentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
      ]);
    },
  });
  if (me.isPending) return <LoadingState label="Đang kiểm tra quyền quản trị…" />;
  if (me.error) return <ErrorState error={me.error} />;
  const memberships =
    me.data?.memberships.filter(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role)) ?? [];
  const organizationOptions = isSystemAdmin
    ? (organizations.data?.organizations
        .filter(({ status }) => status === 'ACTIVE')
        .map((item) => ({
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
    !organizationId &&
    (['points', 'sync', 'audit'].includes(tab) || (!isSystemAdmin && tab === 'members'));
  const globalStudents =
    users.data?.users.filter((item) => {
      if (item.system_role !== 'USER') return false;
      if (item.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role))) {
        return false;
      }
      const memberClasses = item.memberships.filter(({ role }) => role === 'MEMBER');
      if (studentClassFilter === 'UNASSIGNED') return memberClasses.length === 0;
      if (studentClassFilter !== 'ALL') {
        return memberClasses.some(({ organizationId: id }) => id === studentClassFilter);
      }
      return true;
    }) ?? [];
  const verifiableStudents = globalStudents.filter(
    (item) => item.codeforces_handle && item.verification_status === 'UNVERIFIED',
  );
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
    ...(isSystemAdmin
      ? [
          { id: 'rewards', label: 'Phần thưởng' },
          { id: 'content', label: 'Nội dung & cấp bậc' },
          { id: 'leaderboard-links', label: 'Link BXH' },
        ]
      : []),
    { id: 'audit', label: 'Nhật ký' },
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
                        mustChangePassword,
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
                        {organizations.data?.organizations
                          .filter(({ status }) => status === 'ACTIVE')
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field form-span-2">
                      <span>Yêu cầu đổi mật khẩu ở lần đăng nhập đầu?</span>
                      <select
                        onChange={(event) => setMustChangePassword(event.target.value === 'YES')}
                        value={mustChangePassword ? 'YES' : 'NO'}
                      >
                        <option value="YES">Có</option>
                        <option value="NO">Không</option>
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
                      body: {
                        password: resetPassword,
                        mustChangePassword: resetMustChangePassword,
                        reason: reason || 'Admin đặt lại mật khẩu',
                      },
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
                  <label className="field mt-4">
                    <span>Yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo?</span>
                    <select
                      onChange={(event) => setResetMustChangePassword(event.target.value === 'YES')}
                      value={resetMustChangePassword ? 'YES' : 'NO'}
                    >
                      <option value="YES">Có</option>
                      <option value="NO">Không</option>
                    </select>
                  </label>
                  <button className="button-secondary mt-5" type="submit">
                    Đặt lại & đăng xuất các phiên
                  </button>
                </form>
              </div>
              <form
                className="panel import-panel p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  importStudents.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK IMPORT</p>
                  <h2 className="mt-2 text-lg font-black">Import tài khoản học sinh</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Điền slug lớp cho từng học sinh; để trống nếu học sinh chưa thuộc lớp nào.
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
                  <span>File CSV/XLSX</span>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </label>
                <button className="button-secondary" disabled={importStudents.isPending}>
                  {importStudents.isPending ? 'Đang import…' : 'Import tài khoản'}
                </button>
              </form>
              {importStudents.error && (
                <p className="notice error">{importStudents.error.message}</p>
              )}
              {importStudents.data && (
                <p className="notice success">
                  Đã tạo {importStudents.data.created}/{importStudents.data.total} học sinh; lỗi{' '}
                  {importStudents.data.failed}.
                </p>
              )}
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
                        {organizations.data?.organizations
                          .filter(({ status }) => status === 'ACTIVE')
                          .map((item) => (
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
                          {item.must_change_password && (
                            <p className="pending-copy">Phải đổi mật khẩu khi đăng nhập</p>
                          )}
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
                    <button
                      className="button-danger"
                      disabled={item.status === 'INACTIVE'}
                      onClick={() => {
                        if (!window.confirm(`Lưu trữ lớp “${item.name}”?`)) return;
                        mutation.mutate({
                          path: `/admin/organizations/${item.id}`,
                          method: 'DELETE',
                          body: null,
                        });
                      }}
                      type="button"
                    >
                      {item.status === 'INACTIVE' ? 'Đã lưu trữ' : 'Xoá'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === 'members' && isSystemAdmin && (
            <section className="space-y-4">
              <div className="panel student-command-bar p-4">
                <label className="field">
                  <span>Phạm vi học sinh</span>
                  <select
                    onChange={(event) => {
                      setStudentClassFilter(event.target.value);
                      setSelectedStudentIds([]);
                    }}
                    value={studentClassFilter}
                  >
                    <option value="ALL">Tất cả học sinh</option>
                    <option value="UNASSIGNED">Chưa xếp lớp</option>
                    {organizations.data?.organizations
                      .filter(({ status }) => status === 'ACTIVE')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="student-selection-summary">
                  <strong>{globalStudents.length} học sinh</strong>
                  <span>{selectedStudentIds.length} tài khoản đang chọn</span>
                </div>
                <button
                  className="button-secondary"
                  disabled={verifiableStudents.length === 0}
                  onClick={() =>
                    setSelectedStudentIds(verifiableStudents.map((student) => student.id))
                  }
                  type="button"
                >
                  Chọn tất cả chưa xác minh
                </button>
                <button
                  className="button-primary"
                  disabled={selectedStudentIds.length === 0 || verifyStudents.isPending}
                  onClick={() => verifyStudents.mutate(selectedStudentIds)}
                  type="button"
                >
                  {verifyStudents.isPending
                    ? 'Đang xác minh…'
                    : `Xác minh CF (${selectedStudentIds.length})`}
                </button>
              </div>
              {verifyStudents.error && (
                <p className="notice error">{verifyStudents.error.message}</p>
              )}
              {verifyStudents.data && (
                <p className="notice success">
                  Đã xác minh {verifyStudents.data.verified}/{verifyStudents.data.requested} tài
                  khoản; bỏ qua {verifyStudents.data.skipped}.
                </p>
              )}
              {!isSystemAdmin && organizationId && (
                <form
                  className="panel import-panel p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    importStudents.mutate();
                  }}
                >
                  <div>
                    <p className="eyebrow">BULK IMPORT</p>
                    <h2 className="mt-2 text-lg font-black">Import học sinh vào lớp đang chọn</h2>
                    <a
                      className="template-link"
                      download
                      href="/templates/danh-sach-hoc-sinh-mau.csv"
                    >
                      ⇩ Tải file mẫu CSV
                    </a>
                  </div>
                  <label className="field">
                    <span>File CSV/XLSX</span>
                    <input
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                      required
                      type="file"
                    />
                  </label>
                  <button className="button-secondary" disabled={importStudents.isPending}>
                    {importStudents.isPending ? 'Đang import…' : 'Import'}
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Danh sách học sinh</strong>
                  <span>Học sinh có thể chưa thuộc lớp nào</span>
                </div>
                {users.isPending ? (
                  <LoadingState label="Đang tải học sinh…" />
                ) : globalStudents.length === 0 ? (
                  <EmptyState
                    title="Chưa có học sinh"
                    detail="Tạo tài khoản học sinh mới hoặc thay đổi bộ lọc lớp."
                  />
                ) : (
                  globalStudents.map((student) => {
                    const canVerify =
                      Boolean(student.codeforces_handle) &&
                      student.verification_status === 'UNVERIFIED';
                    const checked = selectedStudentIds.includes(student.id);
                    const classes = student.memberships
                      .filter(({ role }) => role === 'MEMBER')
                      .map(({ organizationName }) => organizationName);
                    return (
                      <div className="global-student-row" key={student.id}>
                        <input
                          aria-label={`Chọn ${student.display_name}`}
                          checked={checked}
                          className="student-checkbox"
                          disabled={!canVerify}
                          onChange={() =>
                            setSelectedStudentIds((current) =>
                              checked
                                ? current.filter((id) => id !== student.id)
                                : [...current, student.id],
                            )
                          }
                          type="checkbox"
                        />
                        <div className="member">
                          <Avatar
                            name={student.display_name}
                            rating={student.current_rating}
                            size="sm"
                            url={student.avatar_url}
                          />
                          <div>
                            <strong>{student.display_name}</strong>
                            <p>
                              {student.full_name} · {student.email}
                            </p>
                            <p>{classes.length ? classes.join(', ') : 'Chưa xếp lớp'}</p>
                            {student.codeforces_handle && (
                              <CodeforcesHandle
                                handle={student.codeforces_handle}
                                rating={student.current_rating}
                              />
                            )}
                            {student.pending_handle && (
                              <p className="pending-copy">Yêu cầu đổi: @{student.pending_handle}</p>
                            )}
                          </div>
                        </div>
                        <div className="student-metrics">
                          <span>⚡ {formatNumber(student.cc_level, 2)}</span>
                          <span>◆ {formatNumber(student.cc_point, 2)}</span>
                          <span>◈ {formatNumber(student.cc_balance, 2)}</span>
                        </div>
                        <div className="student-actions">
                          {student.pending_handle ? (
                            <>
                              <button
                                className="button-primary"
                                onClick={() =>
                                  mutation.mutate({
                                    path: `/admin/codeforces-accounts/${student.id}/approve-change`,
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
                                    path: `/admin/codeforces-accounts/${student.id}/reject-change`,
                                    body: {
                                      reason: reason || 'Admin từ chối đổi Codeforces handle',
                                    },
                                  })
                                }
                                type="button"
                              >
                                Từ chối
                              </button>
                            </>
                          ) : canVerify ? (
                            <button
                              className="button-secondary"
                              onClick={() => verifyStudents.mutate([student.id])}
                              type="button"
                            >
                              Xác minh CF
                            </button>
                          ) : student.verification_status ? (
                            <StatusPill value={student.verification_status} />
                          ) : (
                            <span className="text-xs text-[var(--muted)]">Chưa có CF</span>
                          )}
                          <button
                            className="button-secondary"
                            onClick={() => {
                              setEditingUser(student);
                              setTab('accounts');
                            }}
                            type="button"
                          >
                            Sửa
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {tab === 'members' && !isSystemAdmin && !noOrganizationSelected && (
            <section className="space-y-4">
              <div className="panel student-command-bar p-4">
                <div className="student-selection-summary">
                  <strong>{members.data?.members.length ?? 0} học sinh trong lớp</strong>
                  <span>{selectedStudentIds.length} tài khoản đang chọn</span>
                </div>
                <button
                  className="button-secondary"
                  disabled={verifiableMembers.length === 0}
                  onClick={() =>
                    setSelectedStudentIds(verifiableMembers.map((student) => student.user_id))
                  }
                  type="button"
                >
                  Chọn tất cả chưa xác minh
                </button>
                <button
                  className="button-primary"
                  disabled={selectedStudentIds.length === 0 || verifyStudents.isPending}
                  onClick={() => verifyStudents.mutate(selectedStudentIds)}
                  type="button"
                >
                  Xác minh CF ({selectedStudentIds.length})
                </button>
              </div>
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
                      <input
                        aria-label={`Chọn ${member.display_name}`}
                        checked={selectedStudentIds.includes(member.user_id)}
                        className="student-checkbox"
                        disabled={
                          !member.codeforces_handle || member.verification_status !== 'UNVERIFIED'
                        }
                        onChange={() =>
                          setSelectedStudentIds((current) =>
                            current.includes(member.user_id)
                              ? current.filter((id) => id !== member.user_id)
                              : [...current, member.user_id],
                          )
                        }
                        type="checkbox"
                      />
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
                    Điều chỉnh đồng thời CC Point và CC Balance. Mỗi lệnh có khóa chống ghi trùng và
                    được lưu trong nhật ký.
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
          {tab === 'leaderboard-links' && isSystemAdmin && (
            <section className="space-y-6">
              <form
                className="panel leaderboard-link-generator p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/admin/leaderboard-links',
                    body: {
                      organizationId: leaderboardScope === 'ALL' ? null : leaderboardOrganizationId,
                    },
                  });
                }}
              >
                <div>
                  <p className="eyebrow">PUBLIC LEADERBOARD</p>
                  <h2 className="mt-2 text-xl font-black">Tạo link xem BXH không cần đăng nhập</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Mỗi phạm vi chỉ có một link đang hoạt động. Tạo link mới sẽ tự thu hồi link cũ.
                  </p>
                </div>
                <label className="field">
                  <span>Phạm vi</span>
                  <select
                    onChange={(event) =>
                      setLeaderboardScope(event.target.value as 'ALL' | 'ORGANIZATION')
                    }
                    value={leaderboardScope}
                  >
                    <option value="ALL">Toàn hệ thống</option>
                    <option value="ORGANIZATION">Một lớp học</option>
                  </select>
                </label>
                {leaderboardScope === 'ORGANIZATION' && (
                  <label className="field">
                    <span>Lớp học</span>
                    <select
                      onChange={(event) => setLeaderboardOrganizationId(event.target.value)}
                      required
                      value={leaderboardOrganizationId}
                    >
                      <option value="">Chọn lớp</option>
                      {organizations.data?.organizations
                        .filter(({ status }) => status === 'ACTIVE')
                        .map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <button className="button-primary" type="submit">
                  Gen link mới
                </button>
              </form>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Link BXH đang hoạt động</strong>
                  <span>Có thể gửi trực tiếp cho phụ huynh và học sinh</span>
                </div>
                {!leaderboardLinks.data?.links.length ? (
                  <EmptyState
                    title="Chưa có link công khai"
                    detail="Hãy tạo link đầu tiên ở phía trên."
                  />
                ) : (
                  leaderboardLinks.data.links.map((link) => {
                    const publicUrl = `${window.location.origin}/leaderboard/${link.public_key}`;
                    return (
                      <div className="admin-row leaderboard-link-row" key={link.id}>
                        <div>
                          <strong>{link.organization_name ?? 'Toàn hệ thống'}</strong>
                          <a href={publicUrl} rel="noreferrer" target="_blank">
                            {publicUrl}
                          </a>
                        </div>
                        <button
                          className="button-secondary"
                          onClick={() => void navigator.clipboard.writeText(publicUrl)}
                          type="button"
                        >
                          Sao chép
                        </button>
                        <button
                          className="button-danger"
                          onClick={() =>
                            mutation.mutate({
                              path: `/admin/leaderboard-links/${link.id}`,
                              method: 'DELETE',
                              body: null,
                            })
                          }
                          type="button"
                        >
                          Thu hồi
                        </button>
                      </div>
                    );
                  })
                )}
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
            <section className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingReward ? `/admin/rewards/${editingReward.id}` : '/admin/rewards',
                      method: editingReward ? 'PATCH' : 'POST',
                      body: {
                        name: rewardName,
                        description: rewardDescription,
                        cost: Number(rewardCost),
                        stock: rewardStock === '' ? null : Number(rewardStock),
                        active: rewardActive,
                        imageUrl: rewardImageUrl || null,
                        cashValueVnd: rewardCashValue === '' ? null : Number(rewardCashValue),
                      },
                    });
                  }}
                >
                  <p className="eyebrow">CATALOG</p>
                  <div className="section-heading mt-2">
                    <h2 className="m-0 text-xl font-black">
                      {editingReward ? 'Sửa phần thưởng' : 'Tạo phần thưởng'}
                    </h2>
                    {editingReward && (
                      <button
                        className="button-secondary"
                        onClick={() => {
                          setEditingReward(null);
                          setRewardName('');
                          setRewardDescription('');
                          setRewardCost('100');
                          setRewardStock('');
                          setRewardImageUrl('');
                          setRewardCashValue('');
                          setRewardActive(true);
                        }}
                        type="button"
                      >
                        Huỷ sửa
                      </button>
                    )}
                  </div>
                  <label className="field mt-5">
                    <span>Tên</span>
                    <input
                      onChange={(e) => setRewardName(e.target.value)}
                      required
                      value={rewardName}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Chi phí CC Balance</span>
                    <input
                      min="1"
                      onChange={(e) => setRewardCost(e.target.value)}
                      required
                      step="1"
                      type="number"
                      value={rewardCost}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Mô tả</span>
                    <textarea
                      onChange={(e) => setRewardDescription(e.target.value)}
                      required
                      value={rewardDescription}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Giá trị tiền nhận được (VND, trống nếu là quà thường)</span>
                    <input
                      min="1"
                      onChange={(event) => setRewardCashValue(event.target.value)}
                      placeholder="Ví dụ: 100000"
                      step="1"
                      type="number"
                      value={rewardCashValue}
                    />
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Số lượng (trống = không giới hạn)</span>
                      <input
                        min="0"
                        onChange={(e) => setRewardStock(e.target.value)}
                        type="number"
                        value={rewardStock}
                      />
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(e) => setRewardActive(e.target.value === 'ACTIVE')}
                        value={rewardActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang mở</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4">
                    <RewardImageUploader onChange={setRewardImageUrl} value={rewardImageUrl} />
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    {editingReward ? 'Lưu phần thưởng' : 'Tạo phần thưởng'}
                  </button>
                </form>
                <div className="panel overflow-hidden">
                  {rewards.data?.rewards.map((reward) => (
                    <div className="admin-row reward-admin-row" key={reward.id}>
                      <div>
                        <strong>{reward.name}</strong>
                        <p className="m-0 text-xs text-[var(--muted)]">
                          {formatNumber(reward.cost, 2)} CC Balance · {reward.stock ?? '∞'} suất
                        </p>
                        {reward.cash_value_vnd !== null && (
                          <p className="cash-reward-value">
                            Nhận {formatVnd(reward.cash_value_vnd)}
                          </p>
                        )}
                      </div>
                      <StatusPill value={reward.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingReward(reward);
                            setRewardName(reward.name);
                            setRewardDescription(reward.description);
                            setRewardCost(reward.cost);
                            setRewardStock(reward.stock === null ? '' : String(reward.stock));
                            setRewardImageUrl(reward.image_url ?? '');
                            setRewardCashValue(
                              reward.cash_value_vnd === null ? '' : String(reward.cash_value_vnd),
                            );
                            setRewardActive(reward.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          disabled={!reward.active}
                          onClick={() => {
                            if (!window.confirm(`Lưu trữ phần thưởng “${reward.name}”?`)) return;
                            mutation.mutate({
                              path: `/admin/rewards/${reward.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          {reward.active ? 'Xoá' : 'Đã lưu trữ'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Yêu cầu đổi quà & quà tiền</strong>
                  <span>“Đã gửi quà” sẽ cập nhật ngay cho Admin và học sinh</span>
                </div>
                {!rewardOrders.data?.orders.length ? (
                  <EmptyState
                    title="Chưa có yêu cầu đổi quà"
                    detail="Các yêu cầu mới sẽ xuất hiện tại đây."
                  />
                ) : (
                  rewardOrders.data.orders.map((order) => (
                    <div className="admin-row reward-order-admin-row" key={order.id}>
                      <div>
                        <strong>{order.display_name}</strong>
                        <p>
                          {order.reward_name} · {formatNumber(order.cost_snapshot)} CC Balance
                        </p>
                        {order.cash_value_vnd !== null && (
                          <p className="cash-reward-value">
                            Quà tiền {formatVnd(order.cash_value_vnd)}
                          </p>
                        )}
                        <small>{formatDate(order.created_at)}</small>
                      </div>
                      <StatusPill value={order.status} />
                      <div className="student-actions">
                        {order.status === 'REQUESTED' && (
                          <>
                            <button
                              className="button-secondary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/reward-orders/${order.id}/status`,
                                  method: 'PATCH',
                                  body: { status: 'APPROVED', note: 'Admin đã duyệt quà' },
                                })
                              }
                              type="button"
                            >
                              Duyệt
                            </button>
                            <button
                              className="button-danger"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/reward-orders/${order.id}/status`,
                                  method: 'PATCH',
                                  body: { status: 'REJECTED', note: 'Admin từ chối yêu cầu' },
                                })
                              }
                              type="button"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                        {order.status === 'APPROVED' && (
                          <button
                            className="button-primary"
                            onClick={() =>
                              mutation.mutate({
                                path: `/reward-orders/${order.id}/status`,
                                method: 'PATCH',
                                body: { status: 'FULFILLED', note: 'Admin xác nhận đã gửi quà' },
                              })
                            }
                            type="button"
                          >
                            Đã gửi quà
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'content' && isSystemAdmin && (
            <div className="content-admin-grid">
              <section className="panel p-6">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">DANH NGÔN TRANG CHỦ</p>
                    <h2>Thông điệp truyền cảm hứng</h2>
                  </div>
                  {editingQuote && (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setEditingQuote(null);
                        setQuoteContent('');
                        setQuoteAuthor('');
                        setQuoteOrder('0');
                        setQuoteActive(true);
                      }}
                      type="button"
                    >
                      Huỷ sửa
                    </button>
                  )}
                </div>
                <form
                  className="quote-import-box"
                  onSubmit={(event) => {
                    event.preventDefault();
                    importQuotes.mutate();
                  }}
                >
                  <div>
                    <strong>Import danh sách danh ngôn</strong>
                    <a download href="/templates/danh-ngon-mau.csv">
                      ⇩ File mẫu CSV
                    </a>
                  </div>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setQuoteImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                  <button className="button-secondary" disabled={importQuotes.isPending}>
                    {importQuotes.isPending ? 'Đang import…' : 'Import'}
                  </button>
                </form>
                {importQuotes.error && <p className="notice error">{importQuotes.error.message}</p>}
                {importQuotes.data && (
                  <p className="notice success">
                    Đã import {importQuotes.data.created}/{importQuotes.data.total} danh ngôn; lỗi{' '}
                    {importQuotes.data.failed}.
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingQuote ? `/admin/quotes/${editingQuote.id}` : '/admin/quotes',
                      method: editingQuote ? 'PATCH' : 'POST',
                      body: {
                        content: quoteContent,
                        author: quoteAuthor || null,
                        sortOrder: Number(quoteOrder),
                        active: quoteActive,
                      },
                    });
                  }}
                >
                  <label className="field">
                    <span>Nội dung</span>
                    <textarea
                      maxLength={1000}
                      onChange={(event) => setQuoteContent(event.target.value)}
                      placeholder="Mỗi bài toán hôm nay là một bước tiến ngày mai…"
                      required
                      value={quoteContent}
                    />
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Tác giả / nguồn</span>
                      <input
                        onChange={(event) => setQuoteAuthor(event.target.value)}
                        value={quoteAuthor}
                      />
                    </label>
                    <label className="field">
                      <span>Thứ tự</span>
                      <input
                        min="0"
                        onChange={(event) => setQuoteOrder(event.target.value)}
                        step="1"
                        type="number"
                        value={quoteOrder}
                      />
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(event) => setQuoteActive(event.target.value === 'ACTIVE')}
                        value={quoteActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang hiển thị</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                  </div>
                  <button className="button-primary mt-4" type="submit">
                    {editingQuote ? 'Lưu danh ngôn' : 'Thêm danh ngôn'}
                  </button>
                </form>
                <div className="content-admin-list mt-6">
                  {content.data?.quotes.map((quote) => (
                    <article className="content-admin-item" key={quote.id}>
                      <div>
                        <blockquote>“{quote.content}”</blockquote>
                        <p>
                          {quote.author || 'Không ghi nguồn'} · thứ tự {quote.sort_order}
                        </p>
                      </div>
                      <StatusPill value={quote.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingQuote(quote);
                            setQuoteContent(quote.content);
                            setQuoteAuthor(quote.author ?? '');
                            setQuoteOrder(String(quote.sort_order));
                            setQuoteActive(quote.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          onClick={() => {
                            if (!window.confirm('Xoá danh ngôn này?')) return;
                            mutation.mutate({
                              path: `/admin/quotes/${quote.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          Xoá
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel p-6">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">CC LEVEL RANKS</p>
                    <h2>Cấp bậc học sinh</h2>
                  </div>
                  {editingRank && (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setEditingRank(null);
                        setRankMinLevel('800');
                        setRankName('');
                        setRankIcon('🏅');
                        setRankColor('#22d3ee');
                        setRankActive(true);
                      }}
                      type="button"
                    >
                      Huỷ sửa
                    </button>
                  )}
                </div>
                <p className="admin-helper-copy">
                  Hệ thống chọn mốc cao nhất không vượt quá CC Level hiện tại. Icon có thể là emoji
                  hoặc URL ảnh.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingRank
                        ? `/admin/level-ranks/${editingRank.id}`
                        : '/admin/level-ranks',
                      method: editingRank ? 'PATCH' : 'POST',
                      body: {
                        minLevel: Number(rankMinLevel),
                        name: rankName,
                        icon: rankIcon,
                        color: rankColor,
                        active: rankActive,
                      },
                    });
                  }}
                >
                  <div className="form-grid">
                    <label className="field">
                      <span>CC Level tối thiểu</span>
                      <input
                        min="0"
                        onChange={(event) => setRankMinLevel(event.target.value)}
                        required
                        step="1"
                        type="number"
                        value={rankMinLevel}
                      />
                    </label>
                    <label className="field">
                      <span>Tên cấp bậc</span>
                      <input
                        onChange={(event) => setRankName(event.target.value)}
                        placeholder="Đồng, Bạc, Vàng…"
                        required
                        value={rankName}
                      />
                    </label>
                    <label className="field">
                      <span>Icon / URL icon</span>
                      <input
                        onChange={(event) => setRankIcon(event.target.value)}
                        required
                        value={rankIcon}
                      />
                    </label>
                    <label className="field">
                      <span>Màu cấp bậc</span>
                      <div className="color-field">
                        <input
                          aria-label="Chọn màu cấp bậc"
                          onChange={(event) => setRankColor(event.target.value)}
                          type="color"
                          value={rankColor}
                        />
                        <input
                          onChange={(event) => setRankColor(event.target.value)}
                          pattern="#[0-9a-fA-F]{6}"
                          value={rankColor}
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(event) => setRankActive(event.target.value === 'ACTIVE')}
                        value={rankActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang áp dụng</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                  </div>
                  <button className="button-primary mt-4" type="submit">
                    {editingRank ? 'Lưu cấp bậc' : 'Thêm cấp bậc'}
                  </button>
                </form>
                <div className="rank-admin-list mt-6">
                  {content.data?.ranks.map((rank) => (
                    <article className="rank-admin-item" key={rank.id}>
                      <LevelRankIcon icon={rank.icon} name={rank.name} />
                      <div>
                        <strong style={{ color: rank.color }}>{rank.name}</strong>
                        <p>Từ CC Level {formatNumber(rank.min_level)}</p>
                      </div>
                      <StatusPill value={rank.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingRank(rank);
                            setRankMinLevel(String(rank.min_level));
                            setRankName(rank.name);
                            setRankIcon(rank.icon);
                            setRankColor(rank.color);
                            setRankActive(rank.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          onClick={() => {
                            if (!window.confirm(`Xoá cấp bậc “${rank.name}”?`)) return;
                            mutation.mutate({
                              path: `/admin/level-ranks/${rank.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          Xoá
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}

function LevelRankIcon({ icon, name }: { icon: string; name: string }) {
  const isImage = /^https?:\/\//i.test(icon) || icon.startsWith('/');
  return (
    <span className="level-rank-icon" aria-label={`Cấp bậc ${name}`}>
      {isImage ? <img alt="" src={icon} /> : icon}
    </span>
  );
}
