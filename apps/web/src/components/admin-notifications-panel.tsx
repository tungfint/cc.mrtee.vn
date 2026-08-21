import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, formatDate } from '../lib/api';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface NotificationAdminItem {
  id: string;
  title: string;
  body: string;
  audience: 'ALL' | 'USER' | 'ORGANIZATION';
  target_user_name: string | null;
  target_organization_name: string | null;
  ticker_text: string | null;
  ticker_duration_minutes: number;
  publish_at: string;
  active: boolean;
  recipient_count: number;
  read_count: number;
}

export function AdminNotificationsPanel({
  users,
  organizations,
}: {
  users: { id: string; display_name: string; email: string }[];
  organizations: { id: string; name: string; status: string }[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'ALL' | 'USER' | 'ORGANIZATION'>('ALL');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [tickerText, setTickerText] = useState('');
  const [tickerDuration, setTickerDuration] = useState('60');
  const notifications = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => api<{ notifications: NotificationAdminItem[] }>('/admin/notifications'),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ recipientCount: number }>('/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          audience,
          ...(audience === 'USER' ? { targetUserId } : {}),
          ...(audience === 'ORGANIZATION' ? { targetOrganizationId } : {}),
          tickerText,
          tickerDurationMinutes: tickerText ? Number(tickerDuration) : 0,
          publishAt: publishAt ? new Date(publishAt).toISOString() : new Date().toISOString(),
        }),
      }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      setTickerText('');
      setPublishAt('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-summary'] }),
      ]);
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/admin/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-summary'] }),
      ]);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section className="admin-notification-layout">
      <form className="panel p-6" onSubmit={submit}>
        <p className="eyebrow">GỬI THÔNG BÁO</p>
        <h2 className="mt-2 text-xl font-black">Thông tin cần truyền đạt</h2>
        <div className="form-grid mt-5">
          <label className="field full">
            <span>Tiêu đề</span>
            <input
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label className="field full">
            <span>Nội dung</span>
            <textarea
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={5}
              value={body}
            />
          </label>
          <label className="field">
            <span>Người nhận</span>
            <select
              onChange={(event) => setAudience(event.target.value as typeof audience)}
              value={audience}
            >
              <option value="ALL">Tất cả tài khoản</option>
              <option value="ORGANIZATION">Một lớp học</option>
              <option value="USER">Một học sinh</option>
            </select>
          </label>
          {audience === 'USER' && (
            <label className="field">
              <span>Học sinh</span>
              <select
                onChange={(event) => setTargetUserId(event.target.value)}
                required
                value={targetUserId}
              >
                <option value="">Chọn tài khoản</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name} · {user.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          {audience === 'ORGANIZATION' && (
            <label className="field">
              <span>Lớp học</span>
              <select
                onChange={(event) => setTargetOrganizationId(event.target.value)}
                required
                value={targetOrganizationId}
              >
                <option value="">Chọn lớp</option>
                {organizations
                  .filter(({ status }) => status === 'ACTIVE')
                  .map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Hẹn giờ gửi (để trống: gửi ngay)</span>
            <input
              onChange={(event) => setPublishAt(event.target.value)}
              type="datetime-local"
              value={publishAt}
            />
          </label>
          <label className="field full">
            <span>Dòng chạy quan trọng (không bắt buộc)</span>
            <input
              maxLength={300}
              onChange={(event) => setTickerText(event.target.value)}
              value={tickerText}
            />
          </label>
          {tickerText && (
            <label className="field">
              <span>Thời lượng dòng chạy (phút)</span>
              <input
                min="1"
                max="10080"
                onChange={(event) => setTickerDuration(event.target.value)}
                required
                type="number"
                value={tickerDuration}
              />
            </label>
          )}
        </div>
        {create.error && <p className="notice error">{create.error.message}</p>}
        {create.isSuccess && (
          <p className="notice success">Thông báo đã được tạo và xếp lịch gửi.</p>
        )}
        <button className="button-primary mt-5" disabled={create.isPending} type="submit">
          {create.isPending ? 'Đang gửi…' : publishAt ? 'Hẹn giờ thông báo' : 'Gửi thông báo'}
        </button>
      </form>

      <div className="panel p-6">
        <p className="eyebrow">LỊCH SỬ THÔNG BÁO</p>
        <h2 className="mt-2 text-xl font-black">Đã gửi và đang chờ</h2>
        {notifications.isPending ? (
          <LoadingState label="Đang tải thông báo…" />
        ) : notifications.error ? (
          <ErrorState error={notifications.error} retry={() => void notifications.refetch()} />
        ) : !notifications.data?.notifications.length ? (
          <EmptyState title="Chưa có thông báo" detail="Thông báo được tạo sẽ xuất hiện tại đây." />
        ) : (
          <div className="admin-notification-list mt-5">
            {notifications.data.notifications.map((item) => (
              <article className={item.active ? '' : 'archived'} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>
                    {item.audience === 'ALL'
                      ? 'Tất cả'
                      : (item.target_user_name ?? item.target_organization_name)}
                    {' · '}
                    {formatDate(item.publish_at)} · đã đọc {item.read_count}/{item.recipient_count}
                  </small>
                  {item.ticker_text && (
                    <span className="notification-ticker-preview">
                      📣 {item.ticker_text} · {item.ticker_duration_minutes} phút
                    </span>
                  )}
                </div>
                <button
                  className="button-danger"
                  disabled={!item.active || archive.isPending}
                  onClick={() => {
                    if (window.confirm(`Dừng hiển thị thông báo “${item.title}”?`))
                      archive.mutate(item.id);
                  }}
                  type="button"
                >
                  {item.active ? 'Dừng' : 'Đã dừng'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
