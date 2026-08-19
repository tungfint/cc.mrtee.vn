import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';
import { api, formatNumber, formatVnd } from '../lib/api';

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  image_url: string | null;
  cash_value_vnd: number | null;
  category: 'STANDARD' | 'MASCOT';
  required_cc_level: number;
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
  const mascotRewards =
    rewards.data?.rewards.filter(
      (reward) => reward.cash_value_vnd === null && reward.category === 'MASCOT',
    ) ?? [];
  const regularRewards =
    rewards.data?.rewards.filter(
      (reward) => reward.cash_value_vnd === null && reward.category !== 'MASCOT',
    ) ?? [];
  const redeemReward = (reward: Reward) => {
    if (window.confirm(`Đổi “${reward.name}” với ${formatNumber(reward.cost)} CC Balance?`)) {
      redeem.mutate(reward.id);
    }
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
        <div className={`reward-store-layout ${cashRewards.length ? '' : 'without-cash'}`}>
          <div className="reward-catalog-column">
            {mascotRewards.length > 0 && (
              <RewardSection
                detail="Mở khóa theo CC Level, đổi bằng CC Balance và trưng bày trong hồ sơ cá nhân."
                eyebrow="BỘ SƯU TẬP LINH VẬT"
                rewards={mascotRewards}
                title="Đồng đội đáng yêu của dân Cầy Code"
                onRedeem={redeemReward}
                pending={redeem.isPending}
              />
            )}
            {regularRewards.length > 0 && (
              <RewardSection
                detail="Các trải nghiệm và phần quà khác đang có trong cửa hàng."
                eyebrow="PHẦN THƯỞNG KHÁC"
                rewards={regularRewards}
                title="Chọn món quà phù hợp với bạn"
                onRedeem={redeemReward}
                pending={redeem.isPending}
              />
            )}
          </div>

          {cashRewards.length > 0 && (
            <aside className="panel cash-tier-panel overflow-hidden">
              <div className="cash-tier-heading">
                <span className="cash-tier-icon">₫</span>
                <div>
                  <p className="eyebrow">QUY ĐỔI TIỀN MẶT</p>
                  <h2>CC Balance thành tiền</h2>
                  <p>Chọn một mức phù hợp với số dư hiện có.</p>
                </div>
              </div>
              <div className="cash-tier-list">
                {cashRewards.map((reward) => (
                  <div className="cash-tier-row" key={reward.id}>
                    <div>
                      <span>◈ {formatNumber(reward.cost)}</span>
                      <strong>{formatVnd(reward.cash_value_vnd)}</strong>
                    </div>
                    <button
                      className="button-primary"
                      disabled={redeem.isPending}
                      onClick={() => redeemReward(reward)}
                      type="button"
                    >
                      Đổi
                    </button>
                  </div>
                ))}
              </div>
              <p className="cash-tier-note">Admin sẽ xác nhận khi quà tiền đã được gửi.</p>
            </aside>
          )}
        </div>
      )}
    </>
  );
}

function RewardSection({
  eyebrow,
  title,
  detail,
  rewards,
  pending,
  onRedeem,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  rewards: Reward[];
  pending: boolean;
  onRedeem: (reward: Reward) => void;
}) {
  return (
    <section className="reward-section">
      <div className="reward-section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        <span>{rewards.length} lựa chọn</span>
      </div>
      <div className="reward-grid">
        {rewards.map((reward, index) => (
          <article
            className={`reward-card ${reward.category === 'MASCOT' ? 'mascot-card' : ''}`}
            key={reward.id}
          >
            <div className={`reward-visual visual-${index % 4}`}>
              {reward.image_url ? (
                <img alt={reward.name} src={reward.image_url} />
              ) : (
                <span>{['✦', '⌁', '◈', '⚡'][index % 4]}</span>
              )}
              <small>{reward.stock === null ? 'Không giới hạn' : `Còn ${reward.stock}`}</small>
              {reward.required_cc_level > 0 && (
                <b className="reward-level-lock">
                  ⚡ CC Level {formatNumber(reward.required_cc_level)}
                </b>
              )}
            </div>
            <div className="reward-card-body">
              <p className="eyebrow">
                {reward.category === 'MASCOT' ? 'LINH VẬT SƯU TẦM' : 'PHẦN THƯỞNG'}
              </p>
              <h3>{reward.name}</h3>
              <p className="reward-description">{reward.description}</p>
              <div className="reward-card-action">
                <strong>
                  ◈ {formatNumber(reward.cost)} <small>CC Balance</small>
                </strong>
                <button
                  className="button-primary"
                  disabled={pending}
                  onClick={() => onRedeem(reward)}
                  type="button"
                >
                  Đổi ngay
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
