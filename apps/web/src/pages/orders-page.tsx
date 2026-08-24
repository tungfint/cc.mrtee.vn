import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatDate, formatNumber, formatVnd } from '../lib/api';
import { EmptyState, ErrorState, LoadingState, PageTitle, StatusPill } from '../components/ui';

interface Order {
  id: string;
  reward_name: string;
  cost_snapshot: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  note: string | null;
  cash_value_vnd: number | null;
  recipient_user_id: string | null;
  purchaser_name: string;
  recipient_name: string | null;
  gift_direction: 'SENT' | 'RECEIVED';
  gift_message: string | null;
}

interface CashSummary {
  fulfilledCount: number;
  fulfilledValueVnd: number;
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<{ orders: Order[]; cashSummary: CashSummary }>('/me/reward-orders'),
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
  const cashOrders = orders.data?.orders.filter((order) => order.cash_value_vnd !== null) ?? [];
  const regularOrders = orders.data?.orders.filter((order) => order.cash_value_vnd === null) ?? [];
  return (
    <>
      <PageTitle
        eyebrow="LỊCH SỬ ĐỔI THƯỞNG"
        title="Quà của tôi"
        detail="Theo dõi trạng thái xử lý quà. Yêu cầu bị từ chối hoặc hủy hợp lệ sẽ được hoàn điểm bằng giao dịch mới."
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
          <section className="cash-summary panel">
            <div>
              <span>Tiền đã nhận</span>
              <strong>{formatVnd(orders.data.cashSummary.fulfilledValueVnd)}</strong>
            </div>
            <div>
              <span>Lần đổi tiền hoàn tất</span>
              <strong>{formatNumber(orders.data.cashSummary.fulfilledCount)}</strong>
            </div>
            <p>Chỉ các quà tiền đã được Admin xác nhận gửi mới được cộng vào tổng này.</p>
          </section>
          {cashOrders.length > 0 && (
            <section className="panel cash-exchange-panel overflow-hidden">
              <div className="management-header">
                <strong>Lịch sử đổi tiền</strong>
                <span>{cashOrders.length} yêu cầu</span>
              </div>
              <div className="cash-order-table cash-order-header">
                <span>Ngày tạo</span>
                <span>CC Balance</span>
                <span>Tiền nhận</span>
                <span>Trạng thái</span>
                <span></span>
              </div>
              {cashOrders.map((order) => (
                <div className="cash-order-table" key={order.id}>
                  <span data-label="Ngày tạo">{formatDate(order.created_at)}</span>
                  <strong data-label="CC Balance">◈ {formatNumber(order.cost_snapshot)}</strong>
                  <strong className="cash-money" data-label="Tiền nhận">
                    {formatVnd(order.cash_value_vnd)}
                  </strong>
                  <StatusPill value={order.status} />
                  {['REQUESTED', 'APPROVED'].includes(order.status) ? (
                    <button
                      className="button-secondary"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(order.id)}
                      type="button"
                    >
                      Hủy
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </section>
          )}
          {regularOrders.map((order) => (
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
                {order.recipient_user_id && (
                  <p className="mb-0 mt-2 text-sm text-[var(--muted)]">
                    {order.gift_direction === 'RECEIVED'
                      ? `Quà từ ${order.purchaser_name}`
                      : `Đã tặng ${order.recipient_name ?? 'tài khoản khác'}`}
                    {order.gift_message ? ` · “${order.gift_message}”` : ''}
                  </p>
                )}
                {order.cash_value_vnd !== null && (
                  <p className="cash-order-line">
                    {order.status === 'FULFILLED' ? 'Đã nhận' : 'Quà tiền'}:{' '}
                    <strong>{formatVnd(order.cash_value_vnd)}</strong>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <strong>{formatNumber(order.cost_snapshot, 2)} CC Balance</strong>
                {order.gift_direction !== 'RECEIVED' &&
                  ['REQUESTED', 'APPROVED'].includes(order.status) && (
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
