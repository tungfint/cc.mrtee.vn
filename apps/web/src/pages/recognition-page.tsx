import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, EmptyState, ErrorState, LoadingState, PageTitle } from '../components/ui';
import { api, formatNumber, useSession } from '../lib/api';

interface Recognition {
  profile: {
    id: string;
    full_name: string;
    display_name: string;
    avatar_url: string | null;
    codeforces_handle: string | null;
    current_rating: number | null;
    codeforces_rank: string | null;
    cc_level: string;
    cc_point: string;
    cc_balance: string;
    total_solves: number;
    highest_problem_rating: number | null;
    highest_problem_name: string | null;
  };
  streak: { current_streak: number; longest_streak: number };
  awards: { award_type: string; title: string; season_name: string }[];
  rewards: { name: string; description: string; image_url: string | null }[];
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
  useEffect(() => setHasImage(false), [studentId, recognition.dataUpdatedAt]);

  const createImage = async () => {
    if (!canvasRef.current || !recognition.data) return;
    await drawRecognition(canvasRef.current, recognition.data);
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
          <section className="panel recognition-summary p-6">
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
              <Metric label="Bài đã giải" value={`${recognition.data.profile.total_solves} bài`} />
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
                    <p key={reward.name}>
                      <strong>{reward.name}</strong> · {reward.description}
                    </p>
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
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#06131d');
  gradient.addColorStop(0.55, '#0b2430');
  gradient.addColorStop(1, '#073d3e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.18;
  context.fillStyle = '#35d5d1';
  context.beginPath();
  context.arc(1060, 120, 310, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(40, 1360, 330, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  roundRect(context, 56, 52, 1088, 1396, 40, 'rgba(10, 24, 34, 0.83)', '#2b6570');
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

  centerText(context, 'CẦY CODE · MRTEE.VN', 600, 310, '700 26px Inter, Arial', '#66e4df');
  centerText(context, 'VINH DANH CÁ NHÂN', 600, 365, '900 48px Inter, Arial', '#ffffff');
  centerText(context, data.profile.display_name, 600, 445, '900 64px Inter, Arial', '#ffffff');
  centerText(
    context,
    data.profile.codeforces_handle
      ? `@${data.profile.codeforces_handle} · ${data.profile.codeforces_rank ?? 'Unrated'}`
      : data.profile.full_name,
    600,
    492,
    '600 24px Inter, Arial',
    '#93aab4',
  );

  const stats = [
    ['CC LEVEL', formatNumber(data.profile.cc_level, 2)],
    ['CC POINT', formatNumber(data.profile.cc_point, 2)],
    ['STREAK', `${data.streak.current_streak} ngày`],
    ['BÀI ĐÃ GIẢI', `${data.profile.total_solves}`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 84 + index * 258;
    roundRect(context, x, 550, 234, 142, 22, 'rgba(18, 43, 55, 0.92)', '#234d5a');
    context.fillStyle = '#829ca8';
    context.font = '700 17px Inter, Arial';
    context.fillText(label ?? '', x + 22, 590);
    context.fillStyle = index === 1 ? '#b9a4ff' : '#eef9fa';
    context.font = '900 34px Inter, Arial';
    context.fillText(value ?? '', x + 22, 648);
  });

  roundRect(context, 84, 732, 1032, 112, 22, 'rgba(18, 43, 55, 0.92)', '#234d5a');
  context.fillStyle = '#829ca8';
  context.font = '700 17px Inter, Arial';
  context.fillText('CHINH PHỤC KHÓ NHẤT', 108, 772);
  context.fillStyle = '#ffffff';
  context.font = '800 27px Inter, Arial';
  const highest = data.profile.highest_problem_name
    ? `${data.profile.highest_problem_name} · ${data.profile.highest_problem_rating ?? '—'}`
    : 'Đang chờ cột mốc đầu tiên';
  fitText(context, highest, 108, 815, 980, 27);

  drawList(
    context,
    84,
    890,
    496,
    '🏆  DANH HIỆU',
    data.awards.slice(0, 6).map((award) => `${award.title} · ${award.season_name}`),
    'Chưa có danh hiệu mùa giải',
  );
  drawList(
    context,
    604,
    890,
    512,
    '🎁  QUÀ ĐÃ NHẬN',
    data.rewards.slice(0, 6).map((reward) => reward.name),
    'Chưa có quà đã nhận',
  );

  centerText(
    context,
    'Mỗi bài Accepted là một bước tiến có thật.',
    600,
    1374,
    '700 22px Inter, Arial',
    '#66e4df',
  );
  centerText(
    context,
    new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date(data.generatedAt)),
    600,
    1410,
    '500 17px Inter, Arial',
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
) {
  roundRect(context, x, y, width, 400, 24, 'rgba(18, 43, 55, 0.88)', '#234d5a');
  context.fillStyle = '#66e4df';
  context.font = '800 21px Inter, Arial';
  context.fillText(title, x + 26, y + 48);
  const rows = items.length ? items : [empty];
  rows.forEach((item, index) => {
    context.fillStyle = items.length ? '#edf7f8' : '#829ca8';
    context.font = `${items.length ? '700' : '500'} 19px Inter, Arial`;
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
    context.font = `700 ${size}px Inter, Arial`;
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
