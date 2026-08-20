import { useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';

export function PasswordInput({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={`password-input ${className}`.trim()}>
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? '◉' : '◌'}
      </button>
    </span>
  );
}

export function Avatar({
  name,
  url,
  rating,
  size = 'md',
}: {
  name: string;
  url?: string | null | undefined;
  rating?: number | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className={`avatar avatar-${size} ${codeforcesColor(rating)}`}
      aria-label={`Avatar của ${name}`}
    >
      <span className="avatar-initials">{initials || 'CC'}</span>
      <img alt="" className="avatar-default" src="/brand/cay-code-logo.webp" />
      {url && (
        <img
          alt=""
          className="avatar-custom"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          src={url}
        />
      )}
    </span>
  );
}

export function CodeforcesHandle({
  handle,
  rating,
  large = false,
}: {
  handle: string;
  rating?: number | null;
  large?: boolean;
}) {
  return (
    <a
      className={`cf-handle ${codeforcesColor(rating)}${large ? ' cf-handle-large' : ''}`}
      href={`https://codeforces.com/profile/${encodeURIComponent(handle)}`}
      rel="noreferrer"
      target="_blank"
    >
      @{handle}
      {rating !== null && rating !== undefined && <small>{rating}</small>}
    </a>
  );
}

function codeforcesColor(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || rating < 1200) return 'cf-newbie';
  if (rating < 1400) return 'cf-pupil';
  if (rating < 1600) return 'cf-specialist';
  if (rating < 1900) return 'cf-expert';
  if (rating < 2100) return 'cf-candidate-master';
  if (rating < 2400) return 'cf-master';
  if (rating < 3000) return 'cf-grandmaster';
  return 'cf-legendary';
}

export function StudentName({ name, rating }: { name: string; rating?: number | null }) {
  return <strong className={`student-name ${codeforcesColor(rating)}`}>{name}</strong>;
}

export function LevelRankBadge({
  rank,
}: {
  rank: { name: string; icon: string | null; color: string | null } | null;
}) {
  if (!rank) return null;
  const icon = rank.icon ?? '🏅';
  const image = /^https?:\/\//i.test(icon) || icon.startsWith('/');
  return (
    <span
      className="level-rank-badge"
      style={{ '--rank-color': rank.color ?? '#94a3b8' } as CSSProperties}
    >
      <span className="level-rank-badge-icon">{image ? <img alt="" src={icon} /> : icon}</span>
      {rank.name}
    </span>
  );
}

export function LoadingState({ label, fullPage = false }: { label: string; fullPage?: boolean }) {
  return (
    <div
      className={
        fullPage ? 'grid min-h-screen place-items-center' : 'grid min-h-56 place-items-center'
      }
    >
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span className="size-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
        {label}
      </div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="panel grid min-h-48 place-items-center p-8 text-center">
      <div>
        <p className="mb-2 text-lg font-bold">Không thể tải dữ liệu</p>
        <p className="m-0 text-sm text-[var(--muted)]">
          {error instanceof Error ? error.message : 'Đã có lỗi không xác định.'}
        </p>
        {retry && (
          <button className="button-secondary mt-5" onClick={retry} type="button">
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
      <div>
        <p className="m-0 font-bold">{title}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

export function PageTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <div className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{detail}</div>
      </div>
      {action}
    </header>
  );
}

export function StatusPill({ value }: { value: string }) {
  const good = [
    'READY',
    'ACTIVE',
    'FULFILLED',
    'APPROVED',
    'TEACHER_VERIFIED',
    'ADMIN_VERIFIED',
  ].includes(value);
  const bad = ['ERROR', 'REJECTED', 'INACTIVE', 'SUSPENDED'].includes(value);
  return (
    <span className={`status-pill ${good ? 'status-good' : bad ? 'status-bad' : ''}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}
