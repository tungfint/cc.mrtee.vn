import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';
import { api, formatDate } from '../lib/api';
import { notificationTextStyle, type NotificationTextStyle } from '../lib/notification-style';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  body_style: NotificationTextStyle;
  audience: 'ALL' | 'USER' | 'ORGANIZATION';
  ticker_text: string | null;
  publish_at: string;
  read_at: string | null;
  created_by_name: string | null;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const notifications = useQuery({
    queryKey: ['notifications', page],
    queryFn: () =>
      api<{
        notifications: NotificationItem[];
        page: number;
        pageSize: number;
        total: number;
        unreadCount: number;
      }>(`/notifications?page=${page}&pageSize=20`),
    refetchInterval: 60_000,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notification-summary'] }),
    ]);
  };
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: refresh,
  });

  return (
    <>
      <PageTitle
        eyebrow="TRUNG TÂM THÔNG BÁO"
        title="Không bỏ lỡ điều quan trọng"
        detail="Thông báo từ hệ thống, giáo viên và lớp học được lưu lại tại đây."
        action={
          <button
            className="button-secondary"
            disabled={!notifications.data?.unreadCount || markAll.isPending}
            onClick={() => markAll.mutate()}
            type="button"
          >
            Đánh dấu tất cả đã đọc
          </button>
        }
      />
      {notifications.isPending ? (
        <LoadingState label="Đang tải thông báo…" />
      ) : notifications.error ? (
        <ErrorState error={notifications.error} retry={() => void notifications.refetch()} />
      ) : !notifications.data?.notifications.length ? (
        <EmptyState title="Chưa có thông báo" detail="Thông báo mới sẽ xuất hiện tại đây." />
      ) : (
        <section className="notification-list">
          {notifications.data.notifications.map((item) => (
            <article
              className={`panel notification-card ${item.read_at ? '' : 'unread'}`}
              key={item.id}
            >
              <span className="notification-card-dot" aria-hidden />
              <div>
                <div className="notification-card-heading">
                  <h2>{item.title}</h2>
                  {!item.read_at && <span className="notification-new-label">Mới</span>}
                </div>
                <p style={notificationTextStyle(item.body_style)}>{item.body}</p>
                <small>
                  {item.created_by_name ?? 'Hệ thống'} · {formatDate(item.publish_at)}
                </small>
              </div>
              {!item.read_at && (
                <button
                  className="button-secondary"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(item.id)}
                  type="button"
                >
                  Đã đọc
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {notifications.data && notifications.data.total > notifications.data.pageSize && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            className="button-secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            ← Trước
          </button>
          <span className="text-sm text-[var(--muted)]">Trang {page}</span>
          <button
            className="button-secondary"
            disabled={page * notifications.data.pageSize >= notifications.data.total}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            Sau →
          </button>
        </div>
      )}
    </>
  );
}
