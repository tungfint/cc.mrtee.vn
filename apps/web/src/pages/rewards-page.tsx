import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatNumber, formatVnd } from '../lib/api';
import { EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  image_url: string | null;
  cash_value_vnd: number | null;
}

export default function RewardsPage() {
  const queryClient = useQueryClient();
  const rewards = useQuery({
    queryKey: ['rewards'],
    queryFn: () => api<{ rewards: Reward[] }>('/rewards'),
  });
  const redeem = useMutation({
    mutationFn: (id: string) =>
      api(`/rewards/${id}/redeem`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
  const cashRewards =
    rewards.data?.rewards.filter((reward) => reward.cash_value_vnd !== null) ?? [];
  const regularRewards =
    rewards.data?.rewards.filter((reward) => reward.cash_value_vnd === null) ?? [];
  const redeemReward = (reward: Reward) => {
    if (window.confirm(`Đổi “${reward.name}” với ${formatNumber(reward.cost, 2)} CC Balance?`))
      redeem.mutate(reward.id);
  };
  return (
    <>
      <PageTitle
        eyebrow="REWARD STORE"
        title="Đổi nỗ lực thành trải nghiệm"
        detail="Đổi quà chỉ trừ CC Balance; CC Point, CC Level và thành tích của bạn được giữ nguyên."
      />
      {redeem.isSuccess && (
        <p className="notice success">
          Đã tạo yêu cầu đổi thưởng. Bạn có thể theo dõi tại “Quà của tôi”.
        </p>
      )}
      {redeem.error && <p className="notice error">{redeem.error.message}</p>}
      {rewards.isPending ? (
        <LoadingState label="Đang tải quà…" />
      ) : rewards.error ? (
        <ErrorState error={rewards.error} retry={() => void rewards.refetch()} />
      ) : !rewards.data?.rewards.length ? (
        <EmptyState title="Cửa hàng đang trống" detail="Quản trị viên chưa mở phần thưởng nào." />
      ) : (
        <div className="space-y-6">
          {cashRewards.length > 0 && (
            <section className="panel cash-exchange-panel overflow-hidden">
              <div className="management-header">
                <div>
                  <p className="eyebrow">QUY ĐỔI TIỀN MẶT</p>
                  <strong>Bảng đổi CC Balance thành tiền</strong>
                </div>
                <span>Gọn, rõ mức nhận và số dư cần dùng</span>
              </div>
              <div className="cash-exchange-table cash-exchange-header">
                <span>CC Balance</span>
                <span>Tiền nhận</span>
                <span>Mô tả</span>
                <span></span>
              </div>
              {cashRewards.map((reward) => (
                <div className="cash-exchange-table" key={reward.id}>
                  <strong data-label="CC Balance">◈ {formatNumber(reward.cost)}</strong>
                  <strong className="cash-money" data-label="Tiền nhận">
                    {formatVnd(reward.cash_value_vnd)}
                  </strong>
                  <span data-label="Mô tả">{reward.description}</span>
                  <button
                    className="button-primary"
                    disabled={redeem.isPending}
                    onClick={() => redeemReward(reward)}
                    type="button"
                  >
                    Đổi tiền
                  </button>
                </div>
              ))}
            </section>
          )}
          {regularRewards.length > 0 && (
            <div className="reward-grid">
              {regularRewards.map((reward, index) => (
                <article className="reward-card" key={reward.id}>
                  <div className={`reward-visual visual-${index % 4}`}>
                    {reward.image_url ? (
                      <img alt="" src={reward.image_url} />
                    ) : (
                      <span>{['✦', '⌁', '◈', '⚡'][index % 4]}</span>
                    )}
                    <small>
                      {reward.stock === null ? 'Không giới hạn' : `Còn ${reward.stock}`}
                    </small>
                  </div>
                  <div className="p-5">
                    <p className="eyebrow">PHẦN THƯỞNG</p>
                    <h2 className="mt-1 text-xl font-black">{reward.name}</h2>
                    {reward.cash_value_vnd !== null && (
                      <p className="cash-reward-value">Nhận {formatVnd(reward.cash_value_vnd)}</p>
                    )}
                    <p className="min-h-12 text-sm leading-6 text-[var(--muted)]">
                      {reward.description}
                    </p>
                    <div className="mt-5 flex items-center justify-between">
                      <strong className="text-xl text-[var(--accent)]">
                        {formatNumber(reward.cost, 2)} <small className="text-xs">CC Balance</small>
                      </strong>
                      <button
                        className="button-primary"
                        disabled={redeem.isPending}
                        onClick={() => redeemReward(reward)}
                        type="button"
                      >
                        Đổi ngay
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
