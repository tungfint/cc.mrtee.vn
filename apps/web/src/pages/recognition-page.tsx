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
  const isAdmin = session.data?.user.systemRole === 'SYSTEM_ADMIN';
  const [studentId, setStudentId] = useState('');
  const [hasImage, setHasImage] = useState(false);
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
          student.system_role === 'USER' &&
          student.status === 'ACTIVE' &&
          !student.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role)),
      ) ?? [],
    [students.data],
  );
  useEffect(() => {
    if (isAdmin && !studentId && studentOptions[0]) setStudentId(studentOptions[0].id);
  }, [isAdmin, studentId, studentOptions]);
  const recognition = useQuery({
    queryKey: ['recognition', isAdmin ? studentId : 'me'],
    queryFn: () =>
      api<Recognition>(isAdmin ? `/admin/users/${studentId}/recognition` : '/me/recognition'),
    enabled: Boolean(session.data) && (!isAdmin || Boolean(studentId)),
  });
  useEffect(() => setHasImage(false), [studentId]);

  const createImage = async () => {
    if (!canvasRef.current || !recognition.data) return;
    const refreshed = await recognition.refetch();
    const data = refreshed.data ?? recognition.data;
    await document.fonts.ready;
    await drawRecognition(canvasRef.current, data);
    setHasImage(true);
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
                <p className="eyebrow">HỌC SINH CẦY CODE</p>
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
                value={`⚡ ${formatNumber(recognition.data.profile.cc_level, 2)}`}
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
              <div>
                <span>Quà tiền đã nhận</span>
                <strong>{formatVnd(recognition.data.profile.cash_received_vnd)}</strong>
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
              <button className="button-primary" onClick={() => void createImage()} type="button">
                ✦ Tạo ảnh vinh danh
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
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, mixHex(accent, '#050816', 0.78));
  gradient.addColorStop(0.55, mixHex(accent, '#111827', 0.68));
  gradient.addColorStop(1, mixHex(accent, '#020617', 0.82));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.18;
  context.fillStyle = accent;
  context.beginPath();
  context.arc(1060, 120, 310, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(40, 1360, 330, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  context.save();
  context.globalAlpha = 0.1;
  context.fillStyle = '#ffffff';
  context.font = `900 260px ${VI_FONT}`;
  context.textAlign = 'center';
  context.fillText(data.profile.level_rank_icon ?? '✦', 940, 360);
  context.restore();

  roundRect(
    context,
    56,
    52,
    1088,
    1396,
    40,
    'rgba(10, 24, 34, 0.83)',
    mixHex(accent, '#ffffff', 0.58),
  );
  const portraitSource = sameOriginAsset(data.profile.avatar_url) ?? '/brand/cay-code-logo.webp';
  const portrait = await loadImage(portraitSource).catch(() =>
    loadImage('/brand/cay-code-logo.webp').catch(() => null),
  );
  if (portrait) {
    context.save();
    context.beginPath();
    context.arc(600, 190, 86, 0, Math.PI * 2);
    context.clip();
    context.drawImage(portrait, 514, 104, 172, 172);
    context.restore();
  }

  centerText(context, 'CẦY CODE · MRTEE.VN', 600, 310, `700 26px ${VI_FONT}`, accent);
  centerText(context, 'VINH DANH CÁ NHÂN', 600, 365, `900 48px ${VI_FONT}`, '#ffffff');
  centerText(context, data.profile.display_name, 600, 445, `900 64px ${VI_FONT}`, '#ffffff');
  centerText(
    context,
    data.profile.codeforces_handle
      ? `@${data.profile.codeforces_handle} · ${data.profile.codeforces_rank ?? 'Unrated'}`
      : data.profile.full_name,
    600,
    492,
    `600 24px ${VI_FONT}`,
    '#93aab4',
  );

  centerText(
    context,
    `${data.profile.level_rank_icon ?? '✦'}  ${data.profile.level_rank_name ?? 'KHỞI ĐẦU'}`,
    600,
    535,
    `800 24px ${VI_FONT}`,
    accent,
  );
  const stats = [
    ['CC LEVEL', formatNumber(data.profile.cc_level, 2)],
    ['CC POINT', formatNumber(data.profile.cc_point, 2)],
    ['STREAK', `${data.streak.current_streak} ngày`],
    ['CC BALANCE', formatNumber(data.profile.cc_balance, 2)],
    ['BÀI ĐÃ GIẢI', `${data.profile.total_solves}`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 84 + index * 206;
    roundRect(
      context,
      x,
      570,
      190,
      142,
      22,
      'rgba(18, 24, 45, 0.92)',
      mixHex(accent, '#ffffff', 0.7),
    );
    context.fillStyle = '#829ca8';
    context.font = `700 17px ${VI_FONT}`;
    context.fillText(label ?? '', x + 22, 610);
    context.fillStyle = index === 1 ? accent : '#eef9fa';
    context.font = `900 28px ${VI_FONT}`;
    context.fillText(value ?? '', x + 22, 668);
  });

  roundRect(
    context,
    84,
    752,
    1032,
    112,
    22,
    'rgba(18, 24, 45, 0.92)',
    mixHex(accent, '#ffffff', 0.7),
  );
  context.fillStyle = '#829ca8';
  context.font = `700 17px ${VI_FONT}`;
  context.fillText('CHINH PHỤC KHÓ NHẤT', 108, 792);
  context.fillStyle = '#ffffff';
  context.font = `800 27px ${VI_FONT}`;
  const highest = data.profile.highest_problem_name
    ? `${data.profile.highest_problem_name} · ${data.profile.highest_problem_rating ?? '—'}`
    : 'Đang chờ cột mốc đầu tiên';
  fitText(context, highest, 108, 835, 980, 27);

  drawList(
    context,
    84,
    910,
    496,
    '🏆  DANH HIỆU',
    data.awards.slice(0, 6).map((award) => `${award.title} · ${award.season_name}`),
    'Chưa có danh hiệu mùa giải',
    accent,
  );
  await drawRewardList(
    context,
    604,
    910,
    512,
    '🎁  QUÀ ĐÃ NHẬN',
    data.rewards.slice(0, 6),
    'Chưa có quà đã nhận',
    accent,
  );

  context.font = `700 22px ${VI_FONT}`;
  context.fillStyle = accent;
  context.textAlign = 'center';
  fitText(
    context,
    `“${data.quote?.content ?? 'Mỗi bài toán hôm nay là một bước tiến ngày mai.'}”`,
    600,
    1374,
    1020,
    22,
  );
  context.textAlign = 'start';
  centerText(
    context,
    new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date(data.generatedAt)),
    600,
    1410,
    `500 17px ${VI_FONT}`,
    '#829ca8',
  );
}

function drawList(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  title: string,
  items: string[],
  empty: string,
  accent: string,
) {
  roundRect(
    context,
    x,
    y,
    width,
    400,
    24,
    'rgba(18, 43, 55, 0.88)',
    mixHex(accent, '#ffffff', 0.68),
  );
  context.fillStyle = accent;
  context.font = `800 21px ${VI_FONT}`;
  context.fillText(title, x + 26, y + 48);
  const rows = items.length ? items : [empty];
  rows.forEach((item, index) => {
    context.fillStyle = items.length ? '#edf7f8' : '#829ca8';
    context.font = `${items.length ? '700' : '500'} 19px ${VI_FONT}`;
    fitText(
      context,
      `${items.length ? '•' : '—'} ${item}`,
      x + 26,
      y + 94 + index * 48,
      width - 52,
      19,
    );
  });
}

async function drawRewardList(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  title: string,
  rewards: Recognition['rewards'],
  empty: string,
  accent: string,
) {
  roundRect(
    context,
    x,
    y,
    width,
    400,
    24,
    'rgba(18, 43, 55, 0.88)',
    mixHex(accent, '#ffffff', 0.68),
  );
  context.fillStyle = accent;
  context.font = `800 21px ${VI_FONT}`;
  context.fillText(title, x + 26, y + 48);
  if (!rewards.length) {
    context.fillStyle = '#829ca8';
    context.font = `500 19px ${VI_FONT}`;
    context.fillText(`— ${empty}`, x + 26, y + 94);
    return;
  }
  for (const [index, reward] of rewards.entries()) {
    const rowY = y + 70 + index * 48;
    const source = sameOriginAsset(reward.image_url);
    if (source) {
      const mascot = await loadImage(source).catch(() => null);
      if (mascot) context.drawImage(mascot, x + 24, rowY, 38, 38);
    }
    context.fillStyle = '#edf7f8';
    context.font = `700 19px ${VI_FONT}`;
    fitText(context, reward.name, x + 72, rowY + 27, width - 98, 19);
  }
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
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

function centerText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
) {
  context.font = font;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.fillText(text, x, y);
  context.textAlign = 'start';
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
