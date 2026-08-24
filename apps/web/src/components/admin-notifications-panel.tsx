import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, formatDate } from '../lib/api';
import {
  notificationTextStyle,
  type NotificationTextStyle as TextStyle,
} from '../lib/notification-style';
import { EmptyState, ErrorState, LoadingState } from './ui';

interface NotificationAdminItem {
  id: string;
  title: string;
  body: string;
  body_style: TextStyle;
  audience: 'ALL' | 'USER' | 'ORGANIZATION';
  target_user_name: string | null;
  target_organization_name: string | null;
  ticker_text: string | null;
  ticker_style: TextStyle;
  ticker_duration_minutes: number;
  publish_at: string;
  active: boolean;
  recipient_count: number;
  read_count: number;
}

const defaultBodyStyle: Required<TextStyle> = {
  fontFamily: 'Be Vietnam Pro',
  fontSize: 14,
  color: '#475569',
  fontWeight: 400,
  fontStyle: 'normal',
  textAlign: 'left',
};
const defaultTickerStyle: Required<TextStyle> = {
  ...defaultBodyStyle,
  fontSize: 14,
  color: '#be185d',
  fontWeight: 800,
};

function TextStyleEditor({
  label,
  value,
  onChange,
  style,
  onStyleChange,
  maxLength,
  rows,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  style: Required<TextStyle>;
  onStyleChange: (style: Required<TextStyle>) => void;
  maxLength: number;
  rows: number;
  required?: boolean;
}) {
  const update = <Key extends keyof Required<TextStyle>>(
    key: Key,
    nextValue: Required<TextStyle>[Key],
  ) => onStyleChange({ ...style, [key]: nextValue });
  return (
    <div className="field full notification-editor">
      <span>{label}</span>
      <span className="notification-editor-toolbar" aria-label={`Định dạng ${label}`}>
        <select
          aria-label="Phông chữ"
          onChange={(event) =>
            update('fontFamily', event.target.value as Required<TextStyle>['fontFamily'])
          }
          value={style.fontFamily}
        >
          <option value="Be Vietnam Pro">Be Vietnam Pro</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="monospace">Monospace</option>
        </select>
        <select
          aria-label="Cỡ chữ"
          onChange={(event) => update('fontSize', Number(event.target.value))}
          value={style.fontSize}
        >
          {[12, 14, 16, 18, 20, 24, 28, 30].map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
        <input
          aria-label="Màu chữ"
          onChange={(event) => update('color', event.target.value)}
          title="Màu chữ"
          type="color"
          value={style.color}
        />
        <button
          className={style.fontWeight >= 800 ? 'active' : ''}
          onClick={() => update('fontWeight', style.fontWeight >= 800 ? 400 : 800)}
          title="Chữ đậm"
          type="button"
        >
          B
        </button>
        <button
          className={style.fontStyle === 'italic' ? 'active italic' : 'italic'}
          onClick={() => update('fontStyle', style.fontStyle === 'italic' ? 'normal' : 'italic')}
          title="Chữ nghiêng"
          type="button"
        >
          I
        </button>
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            className={style.textAlign === align ? 'active' : ''}
            key={align}
            onClick={() => update('textAlign', align)}
            title={align === 'left' ? 'Căn trái' : align === 'center' ? 'Căn giữa' : 'Căn phải'}
            type="button"
          >
            {align === 'left' ? '≡←' : align === 'center' ? '≡' : '→≡'}
          </button>
        ))}
      </span>
      <textarea
        aria-label={label}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows={rows}
        style={notificationTextStyle(style)}
        value={value}
      />
    </div>
  );
}

export function AdminNotificationsPanel({
  users,
  organizations,
}: {
  users: { id: string; display_name: string; email: string }[];
  organizations: { id: string; name: string; status: string }[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyStyle, setBodyStyle] = useState<Required<TextStyle>>(defaultBodyStyle);
  const [audience, setAudience] = useState<'ALL' | 'USER' | 'ORGANIZATION'>('ALL');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [tickerText, setTickerText] = useState('');
  const [tickerStyle, setTickerStyle] = useState<Required<TextStyle>>(defaultTickerStyle);
  const [tickerDuration, setTickerDuration] = useState('60');
  const [historyFilter, setHistoryFilter] = useState('ALL');
  const notifications = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => api<{ notifications: NotificationAdminItem[] }>('/admin/notifications'),
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ recipientCount: number }>('/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          bodyStyle,
          audience,
          ...(audience === 'USER' ? { targetUserId } : {}),
          ...(audience === 'ORGANIZATION' ? { targetOrganizationId } : {}),
          tickerText,
          tickerStyle,
          tickerDurationMinutes: tickerText ? Number(tickerDuration) : 0,
          publishAt: publishAt ? new Date(publishAt).toISOString() : new Date().toISOString(),
        }),
      }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      setTickerText('');
      setBodyStyle(defaultBodyStyle);
      setTickerStyle(defaultTickerStyle);
      setPublishAt('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-summary'] }),
      ]);
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/admin/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-summary'] }),
      ]);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const visibleNotifications =
    notifications.data?.notifications.filter((item) => {
      if (historyFilter === 'ALL') return true;
      if (historyFilter === 'TICKER') return Boolean(item.ticker_text);
      if (historyFilter === 'SCHEDULED') return new Date(item.publish_at).getTime() > Date.now();
      if (historyFilter === 'ARCHIVED') return !item.active;
      return item.audience === (historyFilter === 'AUDIENCE_ALL' ? 'ALL' : historyFilter);
    }) ?? [];

  return (
    <section className="admin-notification-layout">
      <form className="panel p-6" onSubmit={submit}>
        <p className="eyebrow">GỬI THÔNG BÁO</p>
        <h2 className="mt-2 text-xl font-black">Thông tin cần truyền đạt</h2>
        <div className="form-grid mt-5">
          <label className="field full">
            <span>Tiêu đề</span>
            <input
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <TextStyleEditor
            label="Nội dung"
            maxLength={5000}
            onChange={setBody}
            onStyleChange={setBodyStyle}
            required
            rows={5}
            style={bodyStyle}
            value={body}
          />
          <label className="field">
            <span>Người nhận</span>
            <select
              onChange={(event) => setAudience(event.target.value as typeof audience)}
              value={audience}
            >
              <option value="ALL">Tất cả tài khoản</option>
              <option value="ORGANIZATION">Một lớp học</option>
              <option value="USER">Một học sinh</option>
            </select>
          </label>
          {audience === 'USER' && (
            <label className="field">
              <span>Học sinh</span>
              <select
                onChange={(event) => setTargetUserId(event.target.value)}
                required
                value={targetUserId}
              >
                <option value="">Chọn tài khoản</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name} · {user.email}
                  </option>
                ))}
              </select>
            </label>
          )}
          {audience === 'ORGANIZATION' && (
            <label className="field">
              <span>Lớp học</span>
              <select
                onChange={(event) => setTargetOrganizationId(event.target.value)}
                required
                value={targetOrganizationId}
              >
                <option value="">Chọn lớp</option>
                {organizations
                  .filter(({ status }) => status === 'ACTIVE')
                  .map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Hẹn giờ gửi (để trống: gửi ngay)</span>
            <input
              onChange={(event) => setPublishAt(event.target.value)}
              type="datetime-local"
              value={publishAt}
            />
          </label>
          <TextStyleEditor
            label="Dòng chạy quan trọng (không bắt buộc)"
            maxLength={300}
            onChange={setTickerText}
            onStyleChange={setTickerStyle}
            rows={2}
            style={tickerStyle}
            value={tickerText}
          />
          {tickerText && (
            <label className="field">
              <span>Thời lượng dòng chạy (phút)</span>
              <input
                min="1"
                max="10080"
                onChange={(event) => setTickerDuration(event.target.value)}
                required
                type="number"
                value={tickerDuration}
              />
            </label>
          )}
        </div>
        {create.error && <p className="notice error">{create.error.message}</p>}
        {create.isSuccess && (
          <p className="notice success">Thông báo đã được tạo và xếp lịch gửi.</p>
        )}
        <button className="button-primary mt-5" disabled={create.isPending} type="submit">
          {create.isPending ? 'Đang gửi…' : publishAt ? 'Hẹn giờ thông báo' : 'Gửi thông báo'}
        </button>
      </form>

      <div className="panel p-6">
        <div className="notification-history-heading">
          <div>
            <p className="eyebrow">LỊCH SỬ THÔNG BÁO</p>
            <h2 className="mt-2 text-xl font-black">Đã gửi và đang chờ</h2>
          </div>
          <label className="field compact-field">
            <span>Lọc loại tin</span>
            <select
              onChange={(event) => setHistoryFilter(event.target.value)}
              value={historyFilter}
            >
              <option value="ALL">Tất cả</option>
              <option value="AUDIENCE_ALL">Toàn hệ thống</option>
              <option value="ORGANIZATION">Theo lớp</option>
              <option value="USER">Cá nhân</option>
              <option value="TICKER">Có dòng chạy</option>
              <option value="SCHEDULED">Đang chờ gửi</option>
              <option value="ARCHIVED">Đã dừng</option>
            </select>
          </label>
        </div>
        {notifications.isPending ? (
          <LoadingState label="Đang tải thông báo…" />
        ) : notifications.error ? (
          <ErrorState error={notifications.error} retry={() => void notifications.refetch()} />
        ) : !visibleNotifications.length ? (
          <EmptyState title="Chưa có thông báo" detail="Thông báo được tạo sẽ xuất hiện tại đây." />
        ) : (
          <div className="admin-notification-list mt-5">
            {visibleNotifications.map((item) => (
              <article className={item.active ? '' : 'archived'} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p style={notificationTextStyle(item.body_style)}>{item.body}</p>
                  <small>
                    {item.audience === 'ALL'
                      ? 'Tất cả'
                      : (item.target_user_name ?? item.target_organization_name)}
                    {' · '}
                    {formatDate(item.publish_at)} · đã đọc {item.read_count}/{item.recipient_count}
                  </small>
                  {item.ticker_text && (
                    <span
                      className="notification-ticker-preview"
                      style={notificationTextStyle(item.ticker_style)}
                    >
                      📣 {item.ticker_text} · {item.ticker_duration_minutes} phút
                    </span>
                  )}
                </div>
                <button
                  className="button-danger"
                  disabled={!item.active || archive.isPending}
                  onClick={() => {
                    if (window.confirm(`Dừng hiển thị thông báo “${item.title}”?`))
                      archive.mutate(item.id);
                  }}
                  type="button"
                >
                  {item.active ? 'Dừng' : 'Đã dừng'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
