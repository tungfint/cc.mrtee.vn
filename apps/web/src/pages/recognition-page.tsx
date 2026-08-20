import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Avatar, EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';
import { api, formatNumber, formatVnd, useSession } from '../lib/api';

interface Recognition {
  profile: {
    id: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    codeforces_handle: string | null;
    current_rating: number | null;
    max_rating: number | null;
    codeforces_rank: string | null;
    codeforces_max_rank: string | null;
    cc_base: string;
    cc_level: string;
    cc_point: string;
    cc_balance: string;
    cash_received_vnd: string;
    total_solves: number;
    solves_last_30_days: number;
    highest_problem_rating: number | null;
    highest_problem_name: string | null;
    classes: string[];
    level_rank_name: string | null;
    level_rank_icon: string | null;
    level_rank_color: string | null;
    level_rank_min_level: number | null;
  };
  streak: { current_streak: number; longest_streak: number };
  awards: { award_type: string; title: string; season_name: string }[];
  rewards: {
    name: string;
    description: string;
    image_url: string | null;
    cash_value_vnd: number | null;
  }[];
  topTags: { tag: string; solved_count: number; max_rating: number | null }[];
  quote: { content: string; author: string | null } | null;
  generatedAt: string;
}

interface AdminStudent {
  id: string;
  display_name: string;
  full_name: string;
  system_role: string;
  status: string;
  memberships: { role: string }[];
}

const VI_FONT = '"Segoe UI", "Noto Sans", Arial, sans-serif';

export default function RecognitionPage() {
  const session = useSession();
  const isAdmin = session.data?.user.systemRole !== 'USER';
  const [studentId, setStudentId] = useState('');
  const [hasImage, setHasImage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const students = useQuery({
    queryKey: ['recognition-students'],
    queryFn: () => api<{ users: AdminStudent[] }>('/admin/users?pageSize=500'),
    enabled: Boolean(isAdmin),
  });
  const studentOptions = useMemo(
    () =>
      students.data?.users.filter(
        (student) =>
          student.status === 'ACTIVE' &&
          (['ADMIN', 'SYSTEM_ADMIN'].includes(student.system_role) ||
            !student.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role))),
      ) ?? [],
    [students.data],
  );
  useEffect(() => {
    if (isAdmin && !studentId) {
      const ownProfile = studentOptions.find(({ id }) => id === session.data?.user.userId);
      setStudentId(ownProfile?.id ?? studentOptions[0]?.id ?? '');
    }
  }, [isAdmin, session.data?.user.userId, studentId, studentOptions]);
  const recognition = useQuery({
    queryKey: ['recognition', isAdmin ? studentId : 'me'],
    queryFn: () =>
      api<Recognition>(isAdmin ? `/admin/users/${studentId}/recognition` : '/me/recognition'),
    enabled: Boolean(session.data) && (!isAdmin || Boolean(studentId)),
  });
  useEffect(() => {
    setHasImage(false);
    setShareUrl('');
    setImageError('');
  }, [studentId]);

  const createImage = async () => {
    if (!canvasRef.current || !recognition.data) return;
    setCreating(true);
    setImageError('');
    try {
      const refreshed = await recognition.refetch();
      const data = refreshed.data ?? recognition.data;
      await document.fonts.ready;
      await drawRecognition(canvasRef.current, data);
      setHasImage(true);
      const blob = await canvasBlob(canvasRef.current);
      const form = new FormData();
      form.append('image', blob, 'vinh-danh.png');
      const uploaded = await api<{ imageUrl: string }>('/recognition-images', {
        method: 'POST',
        body: form,
      });
      setShareUrl(new URL(uploaded.imageUrl, window.location.origin).href);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Không thể tạo ảnh vinh danh');
    } finally {
      setCreating(false);
    }
  };
  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setImageError('Không thể sao chép tự động. Bạn có thể mở và sao chép liên kết phía trên.');
    }
  };
  const shareImage = async () => {
    if (!canvasRef.current || !recognition.data || !shareUrl) return;
    try {
      const title = `Vinh danh ${recognition.data.profile.display_name} · Cầy Cốt MrTee.VN`;
      if (navigator.share) {
        const blob = await canvasBlob(canvasRef.current);
        const file = new File([blob], 'vinh-danh-cay-cot.png', { type: 'image/png' });
        const payload: ShareData = { title, text: title, url: shareUrl };
        if (!navigator.canShare || navigator.canShare({ files: [file] })) payload.files = [file];
        await navigator.share(payload);
        return;
      }
      await copyShareLink();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setImageError(error instanceof Error ? error.message : 'Không thể mở trình chia sẻ');
    }
  };
  const downloadImage = () => {
    if (!canvasRef.current || !recognition.data || !hasImage) return;
    const link = document.createElement('a');
    const safeName = recognition.data.profile.display_name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    link.download = `vinh-danh-${safeName || 'cay-code'}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <>
      <PageTitle
        eyebrow="VINH DANH CÁ NHÂN"
        title="Gói hành trình thành một tấm ảnh"
        detail="Tổng hợp thành tích, danh hiệu và quà đã nhận thành ảnh PNG để lưu lại hoặc chia sẻ."
        action={
          isAdmin ? (
            <select
              aria-label="Chọn học sinh để vinh danh"
              onChange={(event) => setStudentId(event.target.value)}
              value={studentId}
            >
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.display_name} · {student.full_name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {recognition.isPending ? (
        <LoadingState label="Đang tổng hợp thành tích…" />
      ) : recognition.error ? (
        <ErrorState error={recognition.error} retry={() => void recognition.refetch()} />
      ) : !recognition.data ? (
        <EmptyState title="Chưa chọn học sinh" detail="Hãy chọn một học sinh để tạo ảnh." />
      ) : (
        <div className="recognition-layout">
          <section
            className="panel recognition-summary recognition-ranked p-6"
            style={
              {
                '--recognition-accent': recognition.data.profile.level_rank_color ?? '#ec4899',
              } as CSSProperties
            }
          >
            <div className="recognition-rank-banner">
              <span>{recognition.data.profile.level_rank_icon ?? '✦'}</span>
              <div>
                <small>CẤP BẬC HIỆN TẠI</small>
                <strong>{recognition.data.profile.level_rank_name ?? 'Khởi đầu'}</strong>
              </div>
              <p>CC Level từ {formatNumber(recognition.data.profile.level_rank_min_level ?? 0)}</p>
            </div>
            <div className="recognition-person">
              <Avatar
                name={recognition.data.profile.display_name}
                rating={recognition.data.profile.current_rating}
                size="xl"
                url={recognition.data.profile.avatar_url}
              />
              <div>
                <p className="eyebrow">HỌC SINH CẦY CỐT</p>
                <h2>{recognition.data.profile.display_name}</h2>
                <p>
                  {recognition.data.profile.codeforces_handle
                    ? `@${recognition.data.profile.codeforces_handle} · ${recognition.data.profile.codeforces_rank ?? 'Unrated'}`
                    : 'Chưa kết nối Codeforces'}
                </p>
              </div>
            </div>
            <div className="recognition-metrics">
              <Metric
                label="CC Level"
                value={`⚡ ${formatNumber(recognition.data.profile.cc_level)}`}
              />
              <Metric
                label="CC Point"
                value={`◆ ${formatNumber(recognition.data.profile.cc_point, 2)}`}
              />
              <Metric label="Streak" value={`🔥 ${recognition.data.streak.current_streak} ngày`} />
              <Metric
                label="CC Balance"
                value={`◈ ${formatNumber(recognition.data.profile.cc_balance, 2)}`}
              />
              <Metric label="Bài đã giải" value={`${recognition.data.profile.total_solves} bài`} />
              <Metric
                label="30 ngày"
                value={`${recognition.data.profile.solves_last_30_days} bài`}
              />
            </div>
            <div className="recognition-facts">
              <div>
                <span>Lớp học</span>
                <strong>{recognition.data.profile.classes.join(' · ') || 'Chưa xếp lớp'}</strong>
              </div>
              <div>
                <span>Codeforces cao nhất</span>
                <strong>
                  {recognition.data.profile.max_rating ?? 'Unrated'} ·{' '}
                  {recognition.data.profile.codeforces_max_rank ?? '—'}
                </strong>
              </div>
              <div>
                <span>Streak dài nhất</span>
                <strong>{recognition.data.streak.longest_streak} ngày</strong>
              </div>
              <div>
                <span>Bài khó nhất</span>
                <strong>
                  {recognition.data.profile.highest_problem_rating ?? '—'} ·{' '}
                  {recognition.data.profile.highest_problem_name ?? 'Chưa có'}
                </strong>
              </div>
            </div>
            <div className="recognition-tags">
              {recognition.data.topTags.map((tag) => (
                <span key={tag.tag}>
                  <strong>{tag.tag}</strong>
                  <small>{tag.solved_count} bài</small>
                </span>
              ))}
            </div>
            <div className="recognition-lists">
              <div>
                <h3>🏆 Danh hiệu</h3>
                {recognition.data.awards.length ? (
                  recognition.data.awards.slice(0, 6).map((award) => (
                    <p key={`${award.award_type}-${award.title}`}>
                      <strong>{award.title}</strong> · {award.season_name}
                    </p>
                  ))
                ) : (
                  <p>Chưa có danh hiệu mùa giải.</p>
                )}
              </div>
              <div>
                <h3>🎁 Quà đã nhận</h3>
                {recognition.data.rewards.length ? (
                  recognition.data.rewards.slice(0, 6).map((reward) => (
                    <div className="recognition-reward-item" key={reward.name}>
                      {reward.image_url ? (
                        <img alt={reward.name} src={reward.image_url} />
                      ) : (
                        <span>🎁</span>
                      )}
                      <p>
                        <strong>{reward.name}</strong> · {reward.description}
                      </p>
                    </div>
                  ))
                ) : (
                  <p>Chưa có quà đã hoàn thành.</p>
                )}
              </div>
            </div>
            <div className="recognition-actions">
              <button
                className="button-primary"
                disabled={creating}
                onClick={() => void createImage()}
                type="button"
              >
                {creating ? 'Đang tạo ảnh & liên kết…' : '✦ Tạo ảnh vinh danh'}
              </button>
              <button
                className="button-secondary"
                disabled={!hasImage}
                onClick={downloadImage}
                type="button"
              >
                ⇩ Tải ảnh PNG
              </button>
            </div>
            {imageError && <p className="notice error">{imageError}</p>}
            {shareUrl && (
              <div className="recognition-share-box">
                <div>
                  <strong>Liên kết ảnh công khai</strong>
                  <a href={shareUrl} rel="noreferrer" target="_blank">
                    {shareUrl}
                  </a>
                </div>
                <div className="recognition-share-actions">
                  <button
                    className="button-secondary"
                    onClick={() => void copyShareLink()}
                    type="button"
                  >
                    ⧉ Sao chép link
                  </button>
                  <button
                    className="button-primary"
                    onClick={() => void shareImage()}
                    type="button"
                  >
                    ↗ Facebook · Zalo · Instagram
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() =>
                      window.open(
                        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                    type="button"
                  >
                    Facebook
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className={`panel recognition-canvas-wrap ${hasImage ? 'ready' : ''}`}>
            {!hasImage && (
              <div className="recognition-placeholder">
                <span>✦</span>
                <strong>Ảnh vinh danh sẽ xuất hiện tại đây</strong>
                <p>Khổ dọc 1200 × 1500 px, phù hợp để đăng mạng xã hội.</p>
              </div>
            )}
            <canvas height="1500" ref={canvasRef} width="1200" />
          </section>
        </div>
      )}
    </>
  );
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không thể xuất dữ liệu ảnh'))),
      'image/png',
      0.96,
    );
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function drawRecognition(canvas: HTMLCanvasElement, data: Recognition) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const accent = /^#[0-9a-f]{6}$/i.test(data.profile.level_rank_color ?? '')
    ? (data.profile.level_rank_color ?? '#ec4899')
    : '#ec4899';
  const cyan = '#06b6d4';
  const violet = '#8b5cf6';
  const ink = '#172033';
  const muted = '#64748b';
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#fff9fd');
  background.addColorStop(0.38, mixHex(accent, '#ffffff', 0.87));
  background.addColorStop(0.7, '#ecfeff');
  background.addColorStop(1, '#f5f3ff');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  drawGlow(context, 1040, 120, 420, accent, 0.22);
  drawGlow(context, 80, 1410, 460, cyan, 0.18);
  drawGlow(context, 630, 690, 330, violet, 0.08);
  drawTechPattern(context, width, height, accent, cyan);
  roundRect(context, 38, 34, 1124, 1432, 46, 'rgba(255,255,255,0.82)', '#ffffff');
  roundRect(
    context,
    54,
    50,
    1092,
    1400,
    38,
    'rgba(255,255,255,0.5)',
    mixHex(accent, '#ffffff', 0.45),
  );

  roundRect(context, 78, 72, 350, 54, 27, mixHex(accent, '#ffffff', 0.86));
  context.fillStyle = accent;
  context.font = `900 22px ${VI_FONT}`;
  context.fillText('✦  CẦY CỐT · MRTEE.VN', 106, 107);
  context.fillStyle = muted;
  context.font = `700 17px ${VI_FONT}`;
  context.textAlign = 'right';
  context.fillText('ACHIEVEMENT CARD  /  01', 1110, 105);
  context.textAlign = 'start';

  const rankGradient = context.createLinearGradient(78, 148, 1122, 432);
  rankGradient.addColorStop(0, mixHex(accent, '#ffffff', 0.9));
  rankGradient.addColorStop(0.56, '#ffffff');
  rankGradient.addColorStop(1, '#ecfeff');
  roundRect(context, 78, 148, 1044, 284, 34, rankGradient, mixHex(accent, '#ffffff', 0.45));

  const portraitSource = sameOriginAsset(data.profile.avatar_url) ?? '/brand/cay-code-logo.webp';
  const portrait = await loadImage(portraitSource).catch(() =>
    loadImage('/brand/cay-code-logo.webp').catch(() => null),
  );
  context.save();
  context.shadowColor = mixHex(accent, '#000000', 0.18);
  context.shadowBlur = 34;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(248, 290, 116, 0, Math.PI * 2);
  context.fill();
  context.restore();
  context.strokeStyle = accent;
  context.lineWidth = 9;
  context.beginPath();
  context.arc(248, 290, 105, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = cyan;
  context.lineWidth = 3;
  context.setLineDash([12, 12]);
  context.beginPath();
  context.arc(248, 290, 124, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  if (portrait) {
    context.save();
    context.beginPath();
    context.arc(248, 290, 92, 0, Math.PI * 2);
    context.clip();
    drawImageCover(context, portrait, 156, 198, 184, 184);
    context.restore();
  }

  context.fillStyle = accent;
  context.font = `900 20px ${VI_FONT}`;
  context.fillText('VINH DANH HÀNH TRÌNH CẦY CỐT', 410, 194);
  context.fillStyle = ink;
  context.font = `950 58px ${VI_FONT}`;
  fitText(context, data.profile.display_name, 410, 260, 650, 58);
  context.fillStyle = muted;
  context.font = `650 23px ${VI_FONT}`;
  fitText(
    context,
    data.profile.codeforces_handle
      ? `@${data.profile.codeforces_handle}  ·  ${data.profile.codeforces_rank ?? 'Unrated'}  ·  ${data.profile.classes.join(' · ') || 'Tự do'}`
      : `${data.profile.full_name}  ·  ${data.profile.classes.join(' · ') || 'Tự do'}`,
    410,
    304,
    650,
    21,
  );
  roundRect(context, 410, 334, 310, 58, 29, accent);
  context.fillStyle = '#ffffff';
  context.font = `900 21px ${VI_FONT}`;
  fitText(
    context,
    `${data.profile.level_rank_icon ?? '✦'}  ${data.profile.level_rank_name ?? 'KHỞI ĐẦU'}`,
    438,
    371,
    252,
    21,
  );
  context.fillStyle = accent;
  context.font = `950 82px ${VI_FONT}`;
  context.textAlign = 'right';
  context.fillText(formatNumber(data.profile.cc_level), 1070, 375);
  context.fillStyle = muted;
  context.font = `800 17px ${VI_FONT}`;
  context.fillText('CC LEVEL', 1070, 401);
  context.textAlign = 'start';

  const stats = [
    ['◆', 'CC POINT', formatNumber(data.profile.cc_point, 2), accent],
    ['◈', 'CC BALANCE', formatNumber(data.profile.cc_balance, 2), violet],
    ['🔥', 'STREAK', `${data.streak.current_streak} ngày`, '#f97316'],
    ['✓', 'BÀI ĐÃ GIẢI', `${data.profile.total_solves}`, cyan],
  ];
  stats.forEach(([icon, label, value, color], index) => {
    const x = 78 + index * 267;
    drawMetricCard(
      context,
      x,
      462,
      243,
      132,
      icon ?? '✦',
      label ?? '',
      value ?? '',
      color ?? accent,
    );
  });

  roundRect(context, 78, 624, 1044, 142, 28, '#172033');
  const facts = [
    [
      'BÀI KHÓ NHẤT',
      data.profile.highest_problem_name ?? 'Đang chờ',
      `${data.profile.highest_problem_rating ?? '—'} rating`,
    ],
    [
      'CODEFORCES MAX',
      `${data.profile.max_rating ?? 'Unrated'}`,
      data.profile.codeforces_max_rank ?? 'Chưa xếp hạng',
    ],
    [
      '30 NGÀY GẦN NHẤT',
      `${data.profile.solves_last_30_days} bài`,
      `Streak dài nhất ${data.streak.longest_streak} ngày`,
    ],
  ];
  facts.forEach(([label, value, note], index) => {
    const x = 104 + index * 340;
    if (index) {
      context.strokeStyle = 'rgba(255,255,255,0.15)';
      context.beginPath();
      context.moveTo(x - 20, 650);
      context.lineTo(x - 20, 740);
      context.stroke();
    }
    context.fillStyle = index === 0 ? '#f9a8d4' : '#67e8f9';
    context.font = `850 15px ${VI_FONT}`;
    context.fillText(label ?? '', x, 658);
    context.fillStyle = '#ffffff';
    context.font = `900 24px ${VI_FONT}`;
    fitText(context, value ?? '', x, 699, 290, 24);
    context.fillStyle = '#a8b4c7';
    context.font = `650 15px ${VI_FONT}`;
    fitText(context, note ?? '', x, 728, 290, 15);
  });

  context.fillStyle = muted;
  context.font = `850 16px ${VI_FONT}`;
  context.fillText('VÙNG NĂNG LỰC NỔI BẬT', 82, 808);
  drawTagCloud(context, data.topTags.slice(0, 6), 82, 828, accent, cyan);

  drawAchievementPanel(context, 78, 890, 502, 332, data.awards, accent);
  await drawRewardPanel(context, 604, 890, 518, 332, data.rewards, violet);

  const quote = data.quote?.content ?? 'Mỗi bài toán hôm nay là một bước tiến ngày mai.';
  const author = data.quote?.author ?? 'Cầy Cốt MrTee.VN';
  const quoteGradient = context.createLinearGradient(78, 1250, 1122, 1390);
  quoteGradient.addColorStop(0, mixHex(accent, '#ffffff', 0.87));
  quoteGradient.addColorStop(1, '#ecfeff');
  roundRect(context, 78, 1250, 1044, 132, 30, quoteGradient, '#ffffff');
  context.fillStyle = accent;
  context.font = `950 56px ${VI_FONT}`;
  context.fillText('“', 104, 1314);
  context.fillStyle = ink;
  context.font = `800 22px ${VI_FONT}`;
  drawWrappedText(context, quote, 158, 1290, 900, 30, 2);
  context.fillStyle = muted;
  context.font = `700 16px ${VI_FONT}`;
  context.textAlign = 'right';
  context.fillText(`— ${author}`, 1080, 1355);
  context.textAlign = 'start';

  context.fillStyle = accent;
  context.font = `900 16px ${VI_FONT}`;
  context.fillText('CẦY CỐT · MRTEE.VN', 82, 1420);
  context.fillStyle = muted;
  context.font = `700 16px ${VI_FONT}`;
  context.textAlign = 'right';
  context.fillText(
    new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date(data.generatedAt)),
    1108,
    1420,
  );
  context.textAlign = 'start';
}

function drawGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  opacity: number,
) {
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(
    0,
    `${color}${Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0')}`,
  );
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawTechPattern(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  cyan: string,
) {
  context.save();
  context.globalAlpha = 0.11;
  context.strokeStyle = accent;
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 52) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 52) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.globalAlpha = 0.5;
  context.strokeStyle = cyan;
  context.lineWidth = 4;
  const circuits: Array<[number, number, number]> = [
    [20, 180, 180],
    [990, 520, 190],
    [20, 1180, 165],
  ];
  for (const [x, y, dx] of circuits) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + dx, y);
    context.lineTo(x + dx + 34, y + 34);
    context.stroke();
  }
  context.restore();
}

function drawMetricCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  icon: string,
  label: string,
  value: string,
  color: string,
) {
  context.save();
  context.shadowColor = 'rgba(31, 41, 55, 0.08)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 7;
  roundRect(context, x, y, width, height, 24, '#ffffff');
  context.restore();
  roundRect(context, x + 18, y + 18, 45, 45, 15, mixHex(color, '#ffffff', 0.84));
  context.fillStyle = color;
  context.font = `900 21px ${VI_FONT}`;
  context.textAlign = 'center';
  context.fillText(icon, x + 40, y + 49);
  context.textAlign = 'start';
  context.fillStyle = '#64748b';
  context.font = `850 15px ${VI_FONT}`;
  context.fillText(label, x + 76, y + 45);
  context.fillStyle = '#172033';
  context.font = `950 28px ${VI_FONT}`;
  fitText(context, value, x + 20, y + 104, width - 40, 28);
}

function drawTagCloud(
  context: CanvasRenderingContext2D,
  tags: Recognition['topTags'],
  x: number,
  y: number,
  accent: string,
  cyan: string,
) {
  let cursor = x;
  const values = tags.length
    ? tags
    : [{ tag: 'Bắt đầu hành trình', solved_count: 0, max_rating: null }];
  values.forEach((tag, index) => {
    const text = `${tag.tag} · ${tag.solved_count}`;
    context.font = `800 17px ${VI_FONT}`;
    const pillWidth = Math.min(205, context.measureText(text).width + 34);
    if (cursor + pillWidth > 1122) return;
    const color = index % 2 ? cyan : accent;
    roundRect(context, cursor, y, pillWidth, 40, 20, mixHex(color, '#ffffff', 0.86));
    context.fillStyle = color;
    context.fillText(text, cursor + 17, y + 26, pillWidth - 34);
    cursor += pillWidth + 12;
  });
}

function drawAchievementPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  awards: Recognition['awards'],
  accent: string,
) {
  roundRect(context, x, y, width, height, 28, '#ffffff', mixHex(accent, '#ffffff', 0.56));
  roundRect(context, x + 22, y + 20, 52, 52, 17, mixHex(accent, '#ffffff', 0.84));
  context.fillStyle = accent;
  context.font = `900 26px ${VI_FONT}`;
  context.fillText('🏆', x + 34, y + 56);
  context.fillStyle = '#172033';
  context.font = `900 19px ${VI_FONT}`;
  context.fillText('DANH HIỆU ĐÃ CHINH PHỤC', x + 88, y + 52);
  const rows = awards.length ? awards.slice(0, 4) : [];
  if (!rows.length) {
    context.fillStyle = '#64748b';
    context.font = `650 17px ${VI_FONT}`;
    context.fillText('Cột mốc đầu tiên đang chờ bạn.', x + 26, y + 118);
    return;
  }
  rows.forEach((award, index) => {
    const rowY = y + 100 + index * 54;
    context.fillStyle = mixHex(accent, '#ffffff', 0.14);
    context.beginPath();
    context.arc(x + 35, rowY + 7, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#253247';
    context.font = `800 17px ${VI_FONT}`;
    fitText(context, award.title, x + 54, rowY + 13, width - 80, 17);
    context.fillStyle = '#64748b';
    context.font = `650 15px ${VI_FONT}`;
    fitText(context, award.season_name, x + 54, rowY + 36, width - 80, 15);
  });
}

async function drawRewardPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rewards: Recognition['rewards'],
  color: string,
) {
  roundRect(context, x, y, width, height, 28, '#ffffff', mixHex(color, '#ffffff', 0.56));
  roundRect(context, x + 22, y + 20, 52, 52, 17, mixHex(color, '#ffffff', 0.84));
  context.fillStyle = color;
  context.font = `900 26px ${VI_FONT}`;
  context.fillText('🎁', x + 34, y + 56);
  context.fillStyle = '#172033';
  context.font = `900 19px ${VI_FONT}`;
  context.fillText('BỘ SƯU TẬP PHẦN THƯỞNG', x + 88, y + 52);
  const rows = rewards.slice(0, 4);
  if (!rows.length) {
    context.fillStyle = '#64748b';
    context.font = `650 17px ${VI_FONT}`;
    context.fillText('Phần thưởng đầu tiên đang chờ bạn.', x + 26, y + 118);
    return;
  }
  for (const [index, reward] of rows.entries()) {
    const rowY = y + 90 + index * 57;
    roundRect(context, x + 22, rowY, 42, 42, 13, mixHex(color, '#ffffff', 0.9));
    const source = sameOriginAsset(reward.image_url);
    if (source) {
      const mascot = await loadImage(source).catch(() => null);
      if (mascot) drawImageCover(context, mascot, x + 25, rowY + 3, 36, 36);
    } else {
      context.fillStyle = color;
      context.font = `800 19px ${VI_FONT}`;
      context.fillText('✦', x + 34, rowY + 28);
    }
    context.fillStyle = '#253247';
    context.font = `800 17px ${VI_FONT}`;
    fitText(context, reward.name, x + 78, rowY + 18, width - 106, 17);
    context.fillStyle = '#64748b';
    context.font = `650 15px ${VI_FONT}`;
    fitText(
      context,
      reward.cash_value_vnd ? formatVnd(reward.cash_value_vnd) : reward.description,
      x + 78,
      rowY + 39,
      width - 106,
      15,
    );
  }
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(' ').split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let last = lines.at(-1) ?? '';
    while (last && context.measureText(`${last}…`).width > maxWidth) {
      last = last.split(' ').slice(0, -1).join(' ');
    }
    lines[lines.length - 1] = `${last}…`;
  }
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight, maxWidth));
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient,
  stroke?: string,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  startSize: number,
) {
  let size = startSize;
  while (size > 13 && context.measureText(text).width > maxWidth) {
    size -= 1;
    context.font = `700 ${size}px ${VI_FONT}`;
  }
  context.fillText(text, x, y, maxWidth);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function sameOriginAsset(source: string | null) {
  if (!source) return null;
  try {
    const url = new URL(source, window.location.origin);
    return url.origin === window.location.origin ? url.href : null;
  } catch {
    return null;
  }
}

function mixHex(first: string, second: string, weight: number) {
  const parse = (value: string) =>
    [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const a = parse(first);
  const b = parse(second);
  return `#${a
    .map((channel, index) =>
      Math.round(channel * (1 - weight) + (b[index] ?? 0) * weight)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
