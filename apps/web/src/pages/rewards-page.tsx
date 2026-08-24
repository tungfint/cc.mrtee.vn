import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  category: 'STANDARD' | 'MASCOT' | 'ACHIEVEMENT';
  required_cc_level: number;
  achievement_id: string | null;
  achievement_name: string | null;
  achievement_icon: string | null;
  achievement_tier: string | null;
  achievement_color: string | null;
  owned_quantity: number;
  requires_approval: boolean;
}

interface RewardCatalog {
  rewards: Reward[];
  walletBalance: string | null;
}

interface RedeemResult {
  order: { id: string; status: string };
  replayed: boolean;
}

interface GiftRecipient {
  id: string;
  display_name: string;
  avatar_url: string | null;
  codeforces_handle: string | null;
  current_rating: number | null;
}

export default function RewardsPage() {
  const queryClient = useQueryClient();
  const [redeemTarget, setRedeemTarget] = useState<Reward | null>(null);
  const [giftReward, setGiftReward] = useState<Reward | null>(null);
  const [giftRecipientId, setGiftRecipientId] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const rewards = useQuery({
    queryKey: ['rewards'],
    queryFn: () => api<RewardCatalog>('/rewards'),
  });
  const redeem = useMutation({
    mutationFn: (id: string) =>
      api<RedeemResult>(`/rewards/${id}/redeem`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }),
    onSuccess: () => {
      setRedeemTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
  const giftRecipients = useQuery({
    queryKey: ['gift-recipients'],
    queryFn: () => api<{ users: GiftRecipient[] }>('/rewards/gift-recipients'),
    enabled: Boolean(giftReward),
  });
  const gift = useMutation({
    mutationFn: () => {
      if (!giftReward || !giftRecipientId) throw new Error('Chọn người nhận quà');
      return api<RedeemResult>(`/rewards/${giftReward.id}/gift`, {
        method: 'POST',
        body: JSON.stringify({
          recipientUserId: giftRecipientId,
          message: giftMessage,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    },
    onSuccess: async () => {
      setGiftReward(null);
      setGiftRecipientId('');
      setGiftMessage('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rewards'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ]);
    },
  });
  useEffect(() => {
    if (!giftReward && !redeemTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (giftReward && !gift.isPending) setGiftReward(null);
      if (redeemTarget && !redeem.isPending) setRedeemTarget(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [gift.isPending, giftReward, redeem.isPending, redeemTarget]);
  const cashRewards =
    rewards.data?.rewards.filter((reward) => reward.cash_value_vnd !== null) ?? [];
  const mascotRewards =
    rewards.data?.rewards.filter(
      (reward) => reward.cash_value_vnd === null && reward.category === 'MASCOT',
    ) ?? [];
  const regularRewards =
    rewards.data?.rewards.filter(
      (reward) => reward.cash_value_vnd === null && reward.category === 'STANDARD',
    ) ?? [];
  const achievementRewards =
    rewards.data?.rewards.filter((reward) => reward.category === 'ACHIEVEMENT') ?? [];
  const walletBalance = rewards.data?.walletBalance ?? null;
  const walletBalanceValue = walletBalance === null ? null : Number(walletBalance);
  const openRedeemDialog = (reward: Reward) => {
    setGiftReward(null);
    setRedeemTarget(reward);
  };
  const openGiftDialog = (reward: Reward) => {
    setRedeemTarget(null);
    setGiftReward(reward);
  };

  return (
    <>
      <PageTitle
        eyebrow="REWARD STORE"
        title="Đổi nỗ lực thành trải nghiệm"
        detail="Đổi quà chỉ trừ CC Balance; CC Point, CC Level và thành tích của bạn được giữ nguyên."
        action={
          walletBalance !== null ? (
            <div className="reward-balance-hero">
              <span>CC Balance hiện có</span>
              <strong>◈ {formatNumber(walletBalance, 2)}</strong>
            </div>
          ) : undefined
        }
      />
      {redeem.isSuccess && (
        <p className="notice success">
          {redeem.data?.order?.status === 'FULFILLED'
            ? 'Đổi thưởng thành công. Phần thưởng đã được cập nhật ngay vào tài khoản.'
            : 'Đã tạo yêu cầu đổi thưởng. Bạn có thể theo dõi tại “Quà của tôi”.'}
        </p>
      )}
      {redeem.error && <p className="notice error">{redeem.error.message}</p>}
      {gift.isSuccess && <p className="notice success">Đã gửi quà tới tài khoản được chọn.</p>}
      {gift.error && <p className="notice error">{gift.error.message}</p>}
      {redeemTarget && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !redeem.isPending) setRedeemTarget(null);
          }}
        >
          <section
            aria-labelledby="redeem-dialog-title"
            aria-modal="true"
            className="panel reward-gift-panel reward-confirm-panel p-6"
            role="dialog"
          >
            <div className="reward-confirm-summary">
              <div className="reward-confirm-visual">
                {redeemTarget.image_url ? (
                  <img alt={redeemTarget.name} src={redeemTarget.image_url} />
                ) : (
                  <span>{redeemTarget.cash_value_vnd ? '₫' : '✦'}</span>
                )}
              </div>
              <div>
                <p className="eyebrow">XÁC NHẬN ĐỔI THƯỞNG</p>
                <h2 id="redeem-dialog-title">Đổi “{redeemTarget.name}”?</h2>
                <p>{redeemTarget.description}</p>
              </div>
            </div>
            <div className="reward-confirm-cost">
              <span>CC Balance sẽ dùng</span>
              <strong>◈ {formatNumber(redeemTarget.cost)}</strong>
            </div>
            <p className="reward-confirm-note">
              {redeemTarget.requires_approval
                ? 'Yêu cầu sẽ được gửi tới giáo viên hoặc quản trị viên để xác nhận.'
                : 'Phần thưởng sẽ được ghi nhận ngay sau khi xác nhận.'}
            </p>
            {redeem.error && <p className="notice error">{redeem.error.message}</p>}
            <div className="reward-confirm-actions">
              <button
                className="button-secondary"
                disabled={redeem.isPending}
                onClick={() => setRedeemTarget(null)}
                type="button"
              >
                Quay lại
              </button>
              <button
                className="button-primary"
                disabled={redeem.isPending}
                onClick={() => redeem.mutate(redeemTarget.id)}
                type="button"
              >
                {redeem.isPending ? 'Đang đổi thưởng…' : 'Xác nhận đổi'}
              </button>
            </div>
          </section>
        </div>
      )}
      {giftReward && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !gift.isPending) setGiftReward(null);
          }}
        >
          <section
            aria-labelledby="gift-dialog-title"
            aria-modal="true"
            className="panel reward-gift-panel p-6"
            role="dialog"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">TẶNG QUÀ</p>
                <h2 id="gift-dialog-title">Tặng “{giftReward.name}” cho bạn bè</h2>
                <p>
                  Bạn thanh toán {formatNumber(giftReward.cost)} CC Balance; quà sẽ thuộc sở hữu của
                  người nhận.
                </p>
              </div>
              <button
                aria-label="Đóng"
                className="button-secondary"
                disabled={gift.isPending}
                onClick={() => setGiftReward(null)}
                type="button"
              >
                Đóng
              </button>
            </div>
            <div className="form-grid mt-4">
              <label className="field">
                <span>Người nhận</span>
                <select
                  onChange={(event) => setGiftRecipientId(event.target.value)}
                  required
                  value={giftRecipientId}
                >
                  <option value="">Chọn tài khoản</option>
                  {giftRecipients.data?.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name}
                      {user.codeforces_handle ? ` · @${user.codeforces_handle}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Lời nhắn (không bắt buộc)</span>
                <input
                  maxLength={500}
                  onChange={(event) => setGiftMessage(event.target.value)}
                  value={giftMessage}
                />
              </label>
            </div>
            <button
              className="button-primary mt-4"
              disabled={!giftRecipientId || gift.isPending}
              onClick={() => {
                if (!window.confirm(`Xác nhận tặng “${giftReward.name}” cho tài khoản đã chọn?`))
                  return;
                gift.mutate();
              }}
              type="button"
            >
              {gift.isPending ? 'Đang gửi quà…' : 'Xác nhận tặng quà'}
            </button>
          </section>
        </div>
      )}
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
                title="Đồng đội đáng yêu của dân Cầy Cốt"
                onRedeem={openRedeemDialog}
                onGift={openGiftDialog}
                pending={redeem.isPending}
                walletBalance={walletBalanceValue}
              />
            )}
            {achievementRewards.length > 0 && (
              <RewardSection
                detail="Đổi CC Balance để nhận danh hiệu có cấp bậc và icon riêng trên hồ sơ."
                eyebrow="DANH HIỆU"
                rewards={achievementRewards}
                title="Dấu ấn cho hành trình bền bỉ"
                onRedeem={openRedeemDialog}
                onGift={openGiftDialog}
                pending={redeem.isPending}
                walletBalance={walletBalanceValue}
              />
            )}
            {regularRewards.length > 0 && (
              <RewardSection
                detail="Các trải nghiệm và phần quà khác đang có trong cửa hàng."
                eyebrow="PHẦN THƯỞNG KHÁC"
                rewards={regularRewards}
                title="Chọn món quà phù hợp với bạn"
                onRedeem={openRedeemDialog}
                onGift={openGiftDialog}
                pending={redeem.isPending}
                walletBalance={walletBalanceValue}
              />
            )}
          </div>

          {cashRewards.length > 0 && (
            <div className="reward-side-column">
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
                  {cashRewards.map((reward) => {
                    const canAfford =
                      walletBalanceValue === null || walletBalanceValue >= Number(reward.cost);
                    return (
                      <div
                        className={`cash-tier-row ${canAfford ? '' : 'unaffordable'}`}
                        key={reward.id}
                      >
                        <div>
                          <span>◈ {formatNumber(reward.cost)}</span>
                          <strong>{formatVnd(reward.cash_value_vnd)}</strong>
                        </div>
                        <button
                          className="button-primary"
                          disabled={redeem.isPending || !canAfford}
                          onClick={() => openRedeemDialog(reward)}
                          type="button"
                        >
                          {canAfford ? 'Đổi' : 'Chưa đủ'}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="cash-tier-note">
                  Đủ CC Balance là quy đổi thành công ngay, không cần chờ Admin duyệt.
                </p>
              </aside>
              <aside className="panel reward-wallet-panel">
                <div className="reward-wallet-icon">◈</div>
                <div>
                  <span>SỐ DƯ CỦA BẠN</span>
                  <strong>{formatNumber(walletBalance ?? 0, 2)} CC Balance</strong>
                  <p>Phần thưởng không yêu cầu xác nhận sẽ được ghi nhận ngay sau khi đổi.</p>
                  <Link to="/orders">Xem Quà của tôi →</Link>
                </div>
              </aside>
              <RewardQuickShelf
                onRedeem={openRedeemDialog}
                pending={redeem.isPending}
                rewards={[...mascotRewards, ...regularRewards].slice(0, 3)}
                walletBalance={walletBalanceValue}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function RewardQuickShelf({
  rewards,
  pending,
  walletBalance,
  onRedeem,
}: {
  rewards: Reward[];
  pending: boolean;
  walletBalance: number | null;
  onRedeem: (reward: Reward) => void;
}) {
  if (!rewards.length) return null;
  return (
    <aside className="panel reward-quick-shelf">
      <div className="reward-quick-heading">
        <div>
          <p className="eyebrow">KHÁM PHÁ THÊM</p>
          <h3>Bộ sưu tập & phần thưởng</h3>
        </div>
        <span>Đổi nhanh</span>
      </div>
      <div className="reward-quick-list">
        {rewards.map((reward) => {
          const canAfford = walletBalance === null || walletBalance >= Number(reward.cost);
          return (
            <article key={reward.id}>
              <div className="reward-quick-image">
                {reward.image_url ? (
                  <img alt={reward.name} src={reward.image_url} />
                ) : (
                  <span>✦</span>
                )}
              </div>
              <div>
                <strong>{reward.name}</strong>
                <small>◈ {formatNumber(reward.cost)} CC Balance</small>
              </div>
              <button
                aria-label={`Đổi nhanh ${reward.name}`}
                className="button-secondary"
                disabled={pending || !canAfford}
                onClick={() => onRedeem(reward)}
                type="button"
              >
                {canAfford ? 'Đổi' : 'Chưa đủ'}
              </button>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function RewardSection({
  eyebrow,
  title,
  detail,
  rewards,
  pending,
  walletBalance,
  onRedeem,
  onGift,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  rewards: Reward[];
  pending: boolean;
  walletBalance: number | null;
  onRedeem: (reward: Reward) => void;
  onGift: (reward: Reward) => void;
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
            className={`reward-card ${reward.category === 'MASCOT' ? 'mascot-card' : ''} ${reward.category === 'ACHIEVEMENT' ? 'achievement-reward-card' : ''}`}
            key={reward.id}
          >
            <div className={`reward-visual visual-${index % 4}`}>
              {reward.image_url ? (
                <img alt={reward.name} src={reward.image_url} />
              ) : reward.category === 'ACHIEVEMENT' && reward.achievement_icon ? (
                /^https?:\/\//i.test(reward.achievement_icon) ||
                reward.achievement_icon.startsWith('/') ? (
                  <img alt={reward.achievement_name ?? reward.name} src={reward.achievement_icon} />
                ) : (
                  <span style={{ color: reward.achievement_color ?? undefined }}>
                    {reward.achievement_icon}
                  </span>
                )
              ) : (
                <span>{['✦', '⌁', '◈', '⚡'][index % 4]}</span>
              )}
              <small>{reward.stock === null ? 'Không giới hạn' : `Còn ${reward.stock}`}</small>
              {reward.category === 'MASCOT' && reward.owned_quantity > 0 && (
                <b className="reward-owned-badge">×{reward.owned_quantity}</b>
              )}
              {reward.required_cc_level > 0 && (
                <b className="reward-level-lock">
                  ⚡ CC Level {formatNumber(reward.required_cc_level)}
                </b>
              )}
            </div>
            <div className="reward-card-body">
              <p className="eyebrow">
                {reward.category === 'MASCOT'
                  ? 'LINH VẬT SƯU TẦM'
                  : reward.category === 'ACHIEVEMENT'
                    ? `DANH HIỆU · ${achievementTierLabel(reward.achievement_tier)}`
                    : 'PHẦN THƯỞNG'}
              </p>
              <h3>{reward.name}</h3>
              <p className="reward-description">{reward.description}</p>
              <div className="reward-card-action">
                <strong>
                  ◈ {formatNumber(reward.cost)} <small>CC Balance</small>
                </strong>
                <button
                  className="button-primary"
                  disabled={
                    pending || (walletBalance !== null && walletBalance < Number(reward.cost))
                  }
                  onClick={() => onRedeem(reward)}
                  type="button"
                >
                  {walletBalance !== null && walletBalance < Number(reward.cost)
                    ? 'Chưa đủ CC Balance'
                    : 'Đổi ngay'}
                </button>
                <button
                  className="button-secondary"
                  disabled={
                    pending || (walletBalance !== null && walletBalance < Number(reward.cost))
                  }
                  onClick={() => onGift(reward)}
                  type="button"
                >
                  Tặng bạn bè
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function achievementTierLabel(tier: string | null) {
  if (!tier) return 'Chưa xếp cấp';
  return (
    {
      BRONZE: 'Đồng',
      SILVER: 'Bạc',
      GOLD: 'Vàng',
      PLATINUM: 'Bạch kim',
      DIAMOND: 'Kim cương',
      MASTER: 'Cao thủ',
      LEGEND: 'Huyền thoại',
    }[tier] ?? tier
  );
}
