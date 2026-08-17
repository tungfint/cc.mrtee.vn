import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatDate, formatNumber } from '../lib/api';
import { EmptyState, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui';

interface Order {
  id: string;
  reward_name: string;
  cost_snapshot: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  note: string | null;
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<{ orders: Order[] }>('/me/reward-orders'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/reward-orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', note: 'Người dùng chủ động hủy đơn' }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  return (
    <>
      <PageTitle
        eyebrow="LỊCH SỬ ĐỔI THƯỞNG"
        title="Đơn của tôi"
        detail="Theo dõi trạng thái xử lý. Đơn bị từ chối hoặc hủy hợp lệ sẽ được hoàn điểm bằng giao dịch mới."
      />
      {orders.isPending ? (
        <LoadingState label="Đang tải đơn…" />
      ) : orders.error ? (
        <ErrorState error={orders.error} retry={() => void orders.refetch()} />
      ) : !orders.data?.orders.length ? (
        <EmptyState
          title="Bạn chưa đổi quà"
          detail="Khám phá Reward Store để chọn phần thưởng đầu tiên."
        />
      ) : (
        <div className="space-y-3">
          {orders.data.orders.map((order) => (
            <article
              className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              key={order.id}
            >
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="m-0 text-lg font-black">{order.reward_name}</h2>
                  <StatusPill value={order.status} />
                </div>
                <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                  Tạo {formatDate(order.created_at)} {order.note ? `· ${order.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <strong>{formatNumber(order.cost_snapshot, 2)} điểm</strong>
                {['REQUESTED', 'APPROVED'].includes(order.status) && (
                  <button
                    className="button-secondary"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(order.id)}
                    type="button"
                  >
                    Hủy đơn
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
