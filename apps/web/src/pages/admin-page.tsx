import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, formatDate, formatNumber, useSession } from '../lib/api';
import { EmptyState, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui';

interface Membership {
  organization_id: string;
  organization_name: string;
  role: string;
}
interface Member {
  user_id: string;
  display_name: string;
  role: string;
  status: string;
}
interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  active: boolean;
  image_url: string | null;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const [tab, setTab] = useState('members');
  const [organizationId, setOrganizationId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('10');
  const [pointType, setPointType] = useState('BONUS');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('100');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ memberships: Membership[] }>('/me'),
  });
  useEffect(() => {
    if (!organizationId && me.data?.memberships[0])
      setOrganizationId(me.data.memberships[0].organization_id);
  }, [me.data, organizationId]);
  const members = useQuery({
    queryKey: ['admin-members', organizationId],
    queryFn: () => api<{ members: Member[] }>(`/organizations/${organizationId}/members`),
    enabled: Boolean(organizationId),
  });
  const rewards = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: () => api<{ rewards: Reward[] }>('/admin/rewards'),
    enabled: session.data?.user.systemRole === 'SYSTEM_ADMIN',
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
      void queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      void queryClient.invalidateQueries({ queryKey: ['audits'] });
      setReason('');
    },
  });
  if (me.isPending) return <LoadingState label="Đang kiểm tra quyền quản trị…" />;
  if (me.error) return <ErrorState error={me.error} />;
  const memberships =
    me.data?.memberships.filter(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role)) ?? [];
  const selectTarget = targetId || members.data?.members[0]?.user_id || '';
  const submitPoints = (event: FormEvent) => {
    event.preventDefault();
    if (!selectTarget) return;
    const numeric = Math.abs(Number(amount)) * (pointType === 'PENALTY' ? -1 : 1);
    mutation.mutate({
      path: `/admin/users/${selectTarget}/points`,
      body: {
        organizationId,
        type: pointType,
        amount: numeric,
        affectsSeason: true,
        reason,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };
  const verify = (userId: string) =>
    mutation.mutate({
      path: `/organizations/${organizationId}/codeforces-accounts/${userId}/verify`,
      body: { reason: reason || 'Xác minh trực tiếp bởi giáo viên' },
    });
  const tabs = [
    { id: 'members', label: 'Thành viên' },
    { id: 'points', label: 'Điểm & CC Base' },
    { id: 'audit', label: 'Nhật ký' },
    ...(session.data?.user.systemRole === 'SYSTEM_ADMIN'
      ? [{ id: 'rewards', label: 'Phần thưởng' }]
      : []),
  ];
  return (
    <>
      <PageTitle
        eyebrow="CONTROL ROOM"
        title="Quản trị hệ thống"
        detail="Mọi thao tác đặc quyền được kiểm tra lại ở backend và lưu lý do trong audit log."
        action={
          <select
            aria-label="Tổ chức quản trị"
            onChange={(e) => setOrganizationId(e.target.value)}
            value={organizationId}
          >
            {memberships.map((membership) => (
              <option key={membership.organization_id} value={membership.organization_id}>
                {membership.organization_name} · {membership.role}
              </option>
            ))}
          </select>
        }
      />
      {memberships.length === 0 && session.data?.user.systemRole !== 'SYSTEM_ADMIN' ? (
        <EmptyState
          title="Không có quyền quản trị"
          detail="Tài khoản chưa được gán vai trò Teacher hoặc Org Admin."
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
            <p className="notice success">Thao tác đã hoàn tất và được ghi audit.</p>
          )}
          {tab === 'members' && (
            <div className="panel overflow-hidden">
              {members.isPending ? (
                <LoadingState label="Đang tải thành viên…" />
              ) : !members.data?.members.length ? (
                <EmptyState title="Chưa có thành viên" detail="Thêm thành viên qua API quản trị." />
              ) : (
                members.data.members.map((member) => (
                  <div className="admin-row" key={member.user_id}>
                    <div className="member">
                      <i>{member.display_name.slice(0, 2).toUpperCase()}</i>
                      <div>
                        <strong>{member.display_name}</strong>
                        <p className="m-0 text-xs text-[var(--muted)]">{member.user_id}</p>
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
                    <button
                      className="button-secondary"
                      onClick={() => verify(member.user_id)}
                      type="button"
                    >
                      Xác minh CF
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'points' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form className="panel p-6" onSubmit={submitPoints}>
                <p className="eyebrow">LEDGER COMMAND</p>
                <h2 className="mt-1 text-xl font-black">Cộng / trừ / điều chỉnh</h2>
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
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="field">
                    <span>Loại</span>
                    <select onChange={(e) => setPointType(e.target.value)} value={pointType}>
                      <option>BONUS</option>
                      <option>PENALTY</option>
                      <option>ADJUSTMENT</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Số điểm</span>
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
                <button
                  className="button-primary mt-5"
                  disabled={mutation.isPending || !selectTarget}
                  type="submit"
                >
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
                <h2 className="mt-1 text-xl font-black">Hiệu chỉnh CC Base</h2>
                <p className="text-sm leading-6 text-[var(--muted)]">
                  Chỉ thay đổi mốc nền. CC Level vẫn là giá trị lớn hơn giữa mốc nền và kết quả tính
                  toán.
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
                <button
                  className="button-secondary mt-5"
                  disabled={mutation.isPending || !selectTarget}
                  type="submit"
                >
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
          {tab === 'rewards' && (
            <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/admin/rewards',
                    body: {
                      name: rewardName,
                      description: reason || 'Phần thưởng từ MRTEE LAB',
                      cost: Number(rewardCost),
                      stock: null,
                      active: true,
                      imageUrl: null,
                    },
                  });
                }}
              >
                <p className="eyebrow">CATALOG</p>
                <h2 className="mt-1 text-xl font-black">Tạo phần thưởng</h2>
                <label className="field mt-5">
                  <span>Tên</span>
                  <input
                    onChange={(e) => setRewardName(e.target.value)}
                    required
                    value={rewardName}
                  />
                </label>
                <label className="field mt-4">
                  <span>Chi phí</span>
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
                        {formatNumber(reward.cost, 2)} điểm · {reward.stock ?? '∞'} suất
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
