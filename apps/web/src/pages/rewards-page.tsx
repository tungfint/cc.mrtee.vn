import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatNumber } from '../lib/api';
import { EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  image_url: string | null;
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
  return (
    <>
      <PageTitle
        eyebrow="REWARD STORE"
        title="Đổi nỗ lực thành trải nghiệm"
        detail="Đổi quà chỉ trừ CC Point. CC Current và thứ hạng của bạn được giữ nguyên."
      />
      {redeem.isSuccess && (
        <p className="notice success">
          Đã tạo đơn đổi thưởng. Bạn có thể theo dõi tại “Đơn của tôi”.
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
        <div className="reward-grid">
          {rewards.data.rewards.map((reward, index) => (
            <article className="reward-card" key={reward.id}>
              <div className={`reward-visual visual-${index % 4}`}>
                {reward.image_url ? (
                  <img alt="" src={reward.image_url} />
                ) : (
                  <span>{['✦', '⌁', '◈', '⚡'][index % 4]}</span>
                )}
                <small>{reward.stock === null ? 'Không giới hạn' : `Còn ${reward.stock}`}</small>
              </div>
              <div className="p-5">
                <p className="eyebrow">PHẦN THƯỞNG</p>
                <h2 className="mt-1 text-xl font-black">{reward.name}</h2>
                <p className="min-h-12 text-sm leading-6 text-[var(--muted)]">
                  {reward.description}
                </p>
                <div className="mt-5 flex items-center justify-between">
                  <strong className="text-xl text-[var(--accent)]">
                    {formatNumber(reward.cost, 2)} <small className="text-xs">điểm</small>
                  </strong>
                  <button
                    className="button-primary"
                    disabled={redeem.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Đổi “${reward.name}” với ${formatNumber(reward.cost, 2)} điểm?`,
                        )
                      )
                        redeem.mutate(reward.id);
                    }}
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
    </>
  );
}
