import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber, useSession } from '../lib/api';
import {
  Avatar,
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
  display_name: string;
  avatar_url: string | null;
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
  memberships: { organizationName: string; role: string }[];
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
  const [amount, setAmount] = useState('10');
  const [pointType, setPointType] = useState('BONUS');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('100');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
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
  const selectTarget = targetId || members.data?.members[0]?.user_id || '';
  const submitPoints = (event: FormEvent) => {
    event.preventDefault();
    if (!selectTarget) return;
    mutation.mutate({
      path: `/admin/users/${selectTarget}/points`,
      body: {
        organizationId,
        type: pointType,
        amount: Math.abs(Number(amount)) * (pointType === 'PENALTY' ? -1 : 1),
        affectsSeason: true,
        reason,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };
  const tabs = [
    ...(isSystemAdmin
      ? [
          { id: 'accounts', label: 'Tài khoản' },
          { id: 'organizations', label: 'Tổ chức' },
        ]
      : []),
    { id: 'members', label: 'Thành viên' },
    { id: 'points', label: 'Điểm & CC Base' },
    { id: 'audit', label: 'Nhật ký' },
    ...(isSystemAdmin ? [{ id: 'rewards', label: 'Phần thưởng' }] : []),
  ];
  return (
    <>
      <PageTitle
        eyebrow="CONTROL ROOM"
        title="Quản trị Cầy Code"
        detail="Quản lý tài khoản, tổ chức, thành viên và nền kinh tế CC Point trong một nơi."
        action={
          <select
            aria-label="Tổ chức quản trị"
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
          {tab === 'accounts' && isSystemAdmin && (
            <section className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: '/admin/users',
                      body: { email, password, fullName, displayName, systemRole: 'USER' },
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
                        <Avatar name={item.display_name} size="sm" url={item.avatar_url} />
                        <div>
                          <strong>{item.display_name}</strong>
                          <p>{item.email}</p>
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
                      <span className="text-xs text-[var(--muted)]">
                        {item.memberships.length} tổ chức
                      </span>
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
                <h2 className="mt-2 text-xl font-black">Tạo tổ chức</h2>
                <label className="field mt-5">
                  <span>Tên tổ chức</span>
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
                  Tạo tổ chức
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
          {tab === 'members' && (
            <section className="space-y-4">
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
                    <span>Thêm tài khoản vào tổ chức</span>
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
                    <span>Vai trò tổ chức</span>
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
                    Thêm thành viên
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                {members.isPending ? (
                  <LoadingState label="Đang tải thành viên…" />
                ) : !members.data?.members.length ? (
                  <EmptyState
                    title="Chưa có thành viên"
                    detail="Hãy thêm học sinh vào tổ chức qua API quản trị."
                  />
                ) : (
                  members.data.members.map((member) => (
                    <div className="admin-row" key={member.user_id}>
                      <div className="member">
                        <Avatar name={member.display_name} size="sm" url={member.avatar_url} />
                        <strong>{member.display_name}</strong>
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
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'points' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form className="panel p-6" onSubmit={submitPoints}>
                <p className="eyebrow">CC POINT COMMAND</p>
                <h2 className="mt-2 text-xl font-black">Cộng / trừ / điều chỉnh</h2>
                <label className="field mt-5">
                  <span>Thành viên</span>
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
                      <option>BONUS</option>
                      <option>PENALTY</option>
                      <option>ADJUSTMENT</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>CC Point</span>
                    <input
                      min="0.01"
                      onChange={(e) => setAmount(e.target.value)}
                      step="0.01"
                      type="number"
                      value={amount}
                    />
                  </label>
                </div>
                <label className="field mt-4">
                  <span>Lý do bắt buộc</span>
                  <textarea
                    minLength={3}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    value={reason}
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
                    body: { organizationId, ccBase: Number(amount), reason },
                  });
                }}
              >
                <p className="eyebrow">SKILL CALIBRATION</p>
                <h2 className="mt-2 text-xl font-black">Hiệu chỉnh CC Base</h2>
                <p className="text-sm text-[var(--muted)]">
                  CC Level vẫn là giá trị lớn hơn giữa mốc nền và kết quả tính toán.
                </p>
                <label className="field mt-5">
                  <span>CC Base mới</span>
                  <input
                    min="0"
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    value={amount}
                  />
                </label>
                <label className="field mt-4">
                  <span>Lý do bắt buộc</span>
                  <textarea
                    minLength={3}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    value={reason}
                  />
                </label>
                <button className="button-secondary mt-5" disabled={!selectTarget} type="submit">
                  Hiệu chỉnh
                </button>
              </form>
            </div>
          )}
          {tab === 'audit' && (
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
