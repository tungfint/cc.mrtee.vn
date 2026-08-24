import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatNumber, formatVnd, useSession } from '../lib/api';
import {
  Avatar,
  CodeforcesHandle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageTitle,
  PasswordInput,
  StatusPill,
} from '../components/ui';
import { RewardImageUploader } from '../components/reward-image-uploader';
import { EditableImportTable, type EditableImportRow } from '../components/editable-import-table';
import { AdminNotificationsPanel } from '../components/admin-notifications-panel';

function formText(form: FormData, key: string, fallback = '') {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

interface Membership {
  organization_id: string;
  organization_name: string;
  role: string;
}
interface Member {
  user_id: string;
  email: string;
  full_name: string;
  display_name: string;
  avatar_url: string | null;
  cc_level: string;
  codeforces_handle: string | null;
  pending_handle: string | null;
  verification_status: string | null;
  current_rating: number | null;
  codeforces_rank: string | null;
  sync_status: string | null;
  last_sync_at: string | null;
  role: string;
  status: string;
}
interface UserAccount {
  id: string;
  email: string;
  full_name: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  system_role: string;
  leaderboard_visible: boolean;
  activity_risk_level: 'NORMAL' | 'REVIEW' | 'PRIORITY';
  activity_risk_score: number;
  cc_level: string;
  codeforces_handle: string | null;
  pending_handle: string | null;
  verification_status: string | null;
  current_rating: number | null;
  rank: string | null;
  sync_status: string | null;
  last_sync_at: string | null;
  cc_point: string;
  cc_balance: string;
  must_change_password: boolean;
  memberships: { organizationId: string; organizationName: string; role: string }[];
}
interface Organization {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  timezone: string;
  status: string;
  member_count: number;
  active_seasons: number;
}
interface SyncAccount {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  codeforces_handle: string | null;
  verification_status: string | null;
  current_rating: number | null;
  sync_status: string | null;
  last_sync_at: string | null;
  class_label: string;
}
interface Reward {
  id: string;
  name: string;
  description: string;
  cost: string;
  stock: number | null;
  active: boolean;
  image_url: string | null;
  cash_value_vnd: number | null;
  category: 'STANDARD' | 'MASCOT' | 'ACHIEVEMENT';
  required_cc_level: number;
  requires_approval: boolean;
  achievement_id: string | null;
  achievement_name: string | null;
  achievement_icon: string | null;
  achievement_tier: string | null;
  order_count: number;
}
interface RewardOrder {
  id: string;
  display_name: string;
  full_name: string;
  recipient_name: string | null;
  reward_name: string;
  cost_snapshot: string;
  cash_value_vnd: number | null;
  requires_approval: boolean;
  status: string;
  note: string | null;
  created_at: string;
}
interface LeaderboardLink {
  id: string;
  public_key: string;
  organization_id: string | null;
  organization_name: string | null;
  active: boolean;
  created_at: string;
}
interface MotivationalQuote {
  id: string;
  content: string;
  author: string | null;
  active: boolean;
  sort_order: number;
  heart_count: number;
}
interface LevelRank {
  id: string;
  min_level: number;
  name: string;
  icon: string;
  color: string;
  reward_point: string;
  active: boolean;
}
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER' | 'LEGEND';
  color: string;
  required_longest_streak: number;
  active: boolean;
  granted_count: number;
  reward_count: number;
}
const achievementTierLabels: Record<Achievement['tier'], string> = {
  BRONZE: 'Đồng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  PLATINUM: 'Bạch kim',
  DIAMOND: 'Kim cương',
  MASTER: 'Cao thủ',
  LEGEND: 'Huyền thoại',
};

interface StudentImportRow extends EditableImportRow {
  email: string;
  password: string;
  fullName: string;
  displayName: string;
  codeforcesHandle: string;
  classSlug: string;
  mustChangePassword: boolean;
  errors: string[];
}
interface PointImportRow extends EditableImportRow {
  email: string;
  operation: string;
  target: 'CC_POINT' | 'CC_BALANCE' | 'BOTH';
  amount: number;
  reason: string;
  affectsSeason: boolean;
  errors: string[];
}
interface QuoteImportRow extends EditableImportRow {
  content: string;
  author: string;
  sortOrder: number;
  active: boolean;
  errors: string[];
}

const studentImportColumns = [
  { key: 'email', label: 'Tài khoản', width: '190px' },
  { key: 'password', label: 'Mật khẩu', type: 'password' as const, width: '160px' },
  { key: 'fullName', label: 'Họ và tên', width: '190px' },
  { key: 'displayName', label: 'Tên hiển thị', width: '160px' },
  { key: 'codeforcesHandle', label: 'Codeforces', width: '140px' },
  { key: 'classSlug', label: 'Slug lớp', width: '130px' },
  { key: 'mustChangePassword', label: 'Đổi mật khẩu', type: 'checkbox' as const, width: '100px' },
];
const pointImportColumns = [
  { key: 'email', label: 'Tài khoản', width: '190px' },
  {
    key: 'operation',
    label: 'Thao tác',
    type: 'select' as const,
    options: [
      { value: 'CỘNG', label: 'CỘNG' },
      { value: 'TRỪ', label: 'TRỪ' },
    ],
    width: '105px',
  },
  {
    key: 'target',
    label: 'Chỉ số',
    type: 'select' as const,
    options: [
      { value: 'CC_POINT', label: 'CC Point' },
      { value: 'CC_BALANCE', label: 'CC Balance' },
      { value: 'BOTH', label: 'Cả hai' },
    ],
    width: '135px',
  },
  { key: 'amount', label: 'Số lượng', type: 'number' as const, width: '110px' },
  { key: 'reason', label: 'Lý do', width: '240px' },
  { key: 'affectsSeason', label: 'Tính vào mùa', type: 'checkbox' as const, width: '100px' },
];
const quoteImportColumns = [
  { key: 'content', label: 'Câu châm ngôn', width: '360px' },
  { key: 'author', label: 'Tác giả', width: '170px' },
  { key: 'sortOrder', label: 'Thứ tự', type: 'number' as const, width: '100px' },
  { key: 'active', label: 'Hiển thị', type: 'checkbox' as const, width: '90px' },
];

interface AuditLog {
  id: string;
  action: string;
  actor_name: string | null;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

interface CcLevelRecalibrationRow {
  userId: string;
  displayName: string;
  codeforcesHandle: string | null;
  currentLevel: number;
  solveCount: number;
  ratings: number[];
  percentile70: number | null;
  referenceLevel: number;
  nextLevel: number;
  change: number;
  eligible: boolean;
  confidence: 'RELIABLE' | 'FAIR' | 'INSUFFICIENT';
}

interface CcLevelRecalibrationPreview {
  rows: CcLevelRecalibrationRow[];
  summary: { total: number; eligible: number; increases: number; insufficient: number };
}

const auditActionLabels: Record<string, string> = {
  POINT_BONUS: 'Cộng hoặc trừ CC Point',
  POINTS_BULK_IMPORTED: 'Nhập lệnh CC Point hàng loạt',
  CODEFORCES_ACCOUNT_VERIFIED: 'Xác thực tài khoản Codeforces',
  CODEFORCES_HANDLE_CHANGE_APPROVED: 'Duyệt đổi tài khoản Codeforces',
  CODEFORCES_HANDLE_CHANGE_REJECTED: 'Từ chối đổi tài khoản Codeforces',
  CODEFORCES_HANDLE_CHANGE_REQUESTED: 'Yêu cầu đổi tài khoản Codeforces',
  CODEFORCES_SYNC_BATCH_REQUESTED: 'Yêu cầu đồng bộ Codeforces',
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
  USER_PROFILE_UPDATED: 'Cập nhật hồ sơ',
  USER_PASSWORD_CHANGED: 'Đổi mật khẩu',
  USER_PASSWORD_RESET: 'Đặt lại mật khẩu',
  USER_DELETED: 'Xoá tài khoản',
  USER_AVATAR_UPDATED: 'Cập nhật ảnh đại diện',
  USER_AVATAR_REMOVED: 'Xoá ảnh đại diện',
  STUDENTS_IMPORTED: 'Nhập danh sách học sinh',
  ORGANIZATION_CREATED: 'Tạo lớp học',
  ORGANIZATION_UPDATED: 'Cập nhật lớp học',
  ORGANIZATION_ARCHIVED: 'Lưu trữ lớp học',
  ORGANIZATION_MEMBER_ADDED: 'Thêm thành viên vào lớp',
  ORGANIZATION_MEMBERS_BULK_ADDED: 'Thêm nhiều học sinh vào lớp',
  ORGANIZATION_MEMBER_UPDATED: 'Cập nhật thành viên lớp',
  RECOGNITION_IMAGE_CREATED: 'Tạo liên kết ảnh vinh danh',
  REWARD_CREATED: 'Tạo phần thưởng',
  REWARD_UPDATED: 'Cập nhật phần thưởng',
  REWARD_DELETED: 'Xoá phần thưởng',
  REWARD_ARCHIVED: 'Ẩn phần thưởng đã có lịch sử',
  REWARD_ORDER_STATUS_CHANGED: 'Cập nhật yêu cầu đổi quà',
  ACHIEVEMENT_CREATED: 'Tạo danh hiệu',
  ACHIEVEMENT_UPDATED: 'Cập nhật danh hiệu',
  ACHIEVEMENT_ARCHIVED: 'Ẩn danh hiệu',
  ACHIEVEMENT_GRANTED: 'Tặng danh hiệu',
  STREAK_RESCUED: 'Hi sinh linh vật cứu Streak',
  STREAK_BONUS_AWARDED: 'Cộng thưởng Streak',
  NOTIFICATION_CREATED: 'Tạo và gửi thông báo',
  NOTIFICATION_ARCHIVED: 'Dừng hiển thị thông báo',
  QUOTE_CREATED: 'Tạo danh ngôn',
  QUOTE_UPDATED: 'Cập nhật danh ngôn',
  QUOTE_DELETED: 'Xoá danh ngôn',
  CC_LEVEL_RANK_CREATED: 'Tạo cấp bậc CC Level',
  CC_LEVEL_RANK_UPDATED: 'Cập nhật cấp bậc CC Level',
  CC_LEVEL_RANK_DELETED: 'Xoá cấp bậc CC Level',
  CC_LEVEL_RECALIBRATED: 'Hiệu chỉnh CC Level',
  ACTIVITY_RISK_REVIEWED: 'Xác minh cảnh báo hoạt động',
  ACTIVITY_RISK_BULK_VALIDATED: 'Xác minh hợp lệ nhiều tài khoản',
  LEADERBOARD_LINK_GENERATED: 'Tạo liên kết bảng xếp hạng',
  LEADERBOARD_LINK_REVOKED: 'Thu hồi liên kết bảng xếp hạng',
  SEASON_CREATED: 'Tạo mùa giải',
  SEASON_STATUS_CHANGED: 'Đổi trạng thái mùa giải',
  SEASON_CLOSED: 'Đóng mùa giải',
};

const auditFieldLabels: Record<string, string> = {
  name: 'Tên',
  display_name: 'Tên hiển thị',
  full_name: 'Họ và tên',
  email: 'Email',
  status: 'Trạng thái',
  role: 'Vai trò',
  cc_level: 'CC Level',
  amount: 'Số điểm',
  balance: 'CC Balance',
  cost: 'Chi phí',
  stock: 'Số lượng',
  active: 'Đang hoạt động',
  handle: 'Tài khoản CF',
  pending_handle: 'Tài khoản CF chờ duyệt',
  verification_status: 'Xác thực CF',
  cash_value_vnd: 'Giá trị tiền',
  category: 'Loại quà',
  required_cc_level: 'CC Level yêu cầu',
  requires_approval: 'Cần xác nhận',
  required_longest_streak: 'Mốc Streak dài nhất',
  tier: 'Cấp bậc',
  color: 'Màu cấp bậc',
  achievement_id: 'Danh hiệu liên kết',
  reward_point: 'Thưởng cấp bậc',
  targetMetric: 'Chỉ số điều chỉnh',
};

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'trống';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.map(auditValue).join(', ') || 'trống';
  if (['string', 'number', 'bigint'].includes(typeof value))
    return `${value as string | number | bigint}`;
  return JSON.stringify(value);
}

function auditTarget(log: AuditLog) {
  const data = log.after ?? log.before ?? {};
  const label = data.display_name ?? data.name ?? data.email ?? data.handle;
  return typeof label === 'string' || typeof label === 'number'
    ? `${label}`
    : `${log.entity_type} · ${log.entity_id.slice(0, 8)}`;
}

function auditChanges(log: AuditLog) {
  const before = log.before ?? {};
  const after = log.after ?? {};
  return Object.keys(auditFieldLabels)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 5)
    .map(
      (key) => `${auditFieldLabels[key]}: ${auditValue(before[key])} → ${auditValue(after[key])}`,
    );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const isSystemAdmin = session.data?.user.systemRole !== 'USER';
  const isSuperAdmin = session.data?.user.systemRole === 'SYSTEM_ADMIN';
  const [tab, setTab] = useState(isSystemAdmin ? 'accounts' : 'members');
  const [organizationId, setOrganizationId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [pointAmount, setPointAmount] = useState('10');
  const [pointReason, setPointReason] = useState('');
  const [pointType, setPointType] = useState('BONUS');
  const [pointTarget, setPointTarget] = useState<'CC_POINT' | 'CC_BALANCE' | 'BOTH'>('BOTH');
  const [rewardName, setRewardName] = useState('');
  const [rewardCost, setRewardCost] = useState('100');
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardStock, setRewardStock] = useState('');
  const [rewardImageUrl, setRewardImageUrl] = useState('');
  const [rewardActive, setRewardActive] = useState(true);
  const [rewardCashValue, setRewardCashValue] = useState('');
  const [rewardCategory, setRewardCategory] = useState<'STANDARD' | 'MASCOT' | 'ACHIEVEMENT'>(
    'STANDARD',
  );
  const [rewardRequiredLevel, setRewardRequiredLevel] = useState('0');
  const [rewardRequiresApproval, setRewardRequiresApproval] = useState(false);
  const [rewardAchievementId, setRewardAchievementId] = useState('');
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const rewardFormRef = useRef<HTMLFormElement>(null);
  const [quoteContent, setQuoteContent] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [quoteOrder, setQuoteOrder] = useState('0');
  const [quoteActive, setQuoteActive] = useState(true);
  const [quotePaste, setQuotePaste] = useState('');
  const [editingQuote, setEditingQuote] = useState<MotivationalQuote | null>(null);
  const [rankMinLevel, setRankMinLevel] = useState('800');
  const [rankName, setRankName] = useState('');
  const [rankIcon, setRankIcon] = useState('🏅');
  const [rankColor, setRankColor] = useState('#22d3ee');
  const [rankRewardPoint, setRankRewardPoint] = useState('0');
  const [rankActive, setRankActive] = useState(true);
  const [editingRank, setEditingRank] = useState<LevelRank | null>(null);
  const [achievementName, setAchievementName] = useState('');
  const [achievementDescription, setAchievementDescription] = useState('');
  const [achievementIcon, setAchievementIcon] = useState('🏅');
  const [achievementTier, setAchievementTier] = useState<Achievement['tier']>('BRONZE');
  const [achievementColor, setAchievementColor] = useState('#b7791f');
  const [achievementStreak, setAchievementStreak] = useState('3');
  const [achievementActive, setAchievementActive] = useState(true);
  const [editingAchievement, setEditingAchievement] = useState<Achievement | null>(null);
  const [giftAchievementId, setGiftAchievementId] = useState('');
  const [giftAchievementUserId, setGiftAchievementUserId] = useState('');
  const [giftAchievementNote, setGiftAchievementNote] = useState('Admin tặng danh hiệu');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newSystemRole, setNewSystemRole] = useState<'USER' | 'ADMIN' | 'SYSTEM_ADMIN'>('USER');
  const [codeforcesHandle, setCodeforcesHandle] = useState('');
  const [classId, setClassId] = useState('');
  const [resetUserId, setResetUserId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMustChangePassword, setResetMustChangePassword] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pointImportFile, setPointImportFile] = useState<File | null>(null);
  const [quoteImportFile, setQuoteImportFile] = useState<File | null>(null);
  const [studentImportRows, setStudentImportRows] = useState<StudentImportRow[]>([]);
  const [pointImportRows, setPointImportRows] = useState<PointImportRow[]>([]);
  const [quoteImportRows, setQuoteImportRows] = useState<QuoteImportRow[]>([]);
  const [pointImportBatchKey, setPointImportBatchKey] = useState(() => crypto.randomUUID());
  const [leaderboardScope, setLeaderboardScope] = useState<'ALL' | 'ORGANIZATION'>('ALL');
  const [leaderboardOrganizationId, setLeaderboardOrganizationId] = useState('');
  const [syncScope, setSyncScope] = useState<'USER' | 'ORGANIZATION' | 'ALL'>('USER');
  const [syncUserId, setSyncUserId] = useState('');
  const [syncSearch, setSyncSearch] = useState('');
  const [syncStatusFilter, setSyncStatusFilter] = useState('ALL');
  const [syncPage, setSyncPage] = useState(1);
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRiskFilter, setAccountRiskFilter] = useState('ALL');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [classEmailPaste, setClassEmailPaste] = useState('');
  const [recalibrationScope, setRecalibrationScope] = useState<'USER' | 'ORGANIZATION' | 'ALL'>(
    'USER',
  );
  const [recalibrationUserId, setRecalibrationUserId] = useState('');
  const [recalibrationReason, setRecalibrationReason] = useState(
    'Admin hiệu chỉnh CC Level theo các bài rated gần nhất',
  );
  useEffect(() => {
    if (isSystemAdmin && tab === 'members') setTab('accounts');
  }, [isSystemAdmin, tab]);
  useEffect(() => {
    setSyncPage(1);
  }, [organizationId, syncScope, syncSearch, syncStatusFilter]);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ memberships: Membership[] }>('/me'),
  });
  const organizations = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => api<{ organizations: Organization[] }>('/admin/organizations'),
    enabled: Boolean(isSystemAdmin),
  });
  useEffect(() => {
    if (organizationId) return;
    const firstMembership = me.data?.memberships[0]?.organization_id;
    const firstOrganization = organizations.data?.organizations.find(
      ({ status }) => status === 'ACTIVE',
    )?.id;
    if (firstMembership || firstOrganization)
      setOrganizationId(firstMembership ?? firstOrganization ?? '');
  }, [me.data, organizationId, organizations.data]);
  const members = useQuery({
    queryKey: ['admin-members', organizationId],
    queryFn: () => api<{ members: Member[] }>(`/organizations/${organizationId}/members`),
    enabled: Boolean(organizationId),
  });
  const verifiableMembers =
    members.data?.members.filter(
      (member) => member.codeforces_handle && member.verification_status === 'UNVERIFIED',
    ) ?? [];
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api<{ users: UserAccount[]; total: number }>('/admin/users?pageSize=500&status=ACTIVE'),
    enabled: Boolean(isSystemAdmin),
  });
  const rewards = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: () => api<{ rewards: Reward[] }>('/admin/rewards'),
    enabled: Boolean(isSystemAdmin),
  });
  const rewardOrders = useQuery({
    queryKey: ['admin-reward-orders'],
    queryFn: () => api<{ orders: RewardOrder[] }>('/admin/rewards/orders'),
    enabled: Boolean(isSystemAdmin),
  });
  const leaderboardLinks = useQuery({
    queryKey: ['admin-leaderboard-links'],
    queryFn: () => api<{ links: LeaderboardLink[] }>('/admin/leaderboard-links'),
    enabled: Boolean(isSystemAdmin),
  });
  const content = useQuery({
    queryKey: ['admin-content'],
    queryFn: () =>
      api<{ quotes: MotivationalQuote[]; ranks: LevelRank[]; achievements: Achievement[] }>(
        '/admin/content',
      ),
    enabled: Boolean(isSystemAdmin),
  });
  const audits = useQuery({
    queryKey: ['audits', organizationId],
    queryFn: () =>
      api<{
        logs: AuditLog[];
      }>(
        `/admin/users/organization/${organizationId || '00000000-0000-4000-8000-000000000000'}/audit-logs`,
      ),
    enabled: (Boolean(organizationId) || Boolean(isSystemAdmin)) && tab === 'audit',
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body: unknown;
    }) => {
      const options: RequestInit = { method };
      if (body !== null && body !== undefined) options.body = JSON.stringify(body);
      return api(path, options);
    },
    onSuccess: () => {
      for (const key of [
        'admin-members',
        'admin-users',
        'admin-organizations',
        'admin-rewards',
        'admin-content',
        'admin-reward-orders',
        'admin-leaderboard-links',
        'dashboard-content',
        'audits',
        'me',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      setReason('');
    },
  });
  const previewStudents = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', importFile);
      return api<{ rows: StudentImportRow[]; total: number; valid: number }>(
        isSystemAdmin
          ? '/admin/users/import-preview'
          : `/organizations/${organizationId}/students/import-preview`,
        {
          method: 'POST',
          body: form,
        },
      );
    },
    onSuccess: (data) => setStudentImportRows(data.rows),
  });
  const confirmStudents = useMutation({
    mutationFn: () =>
      api<{ created: number; failed: number; total: number }>(
        isSystemAdmin
          ? '/admin/users/import-confirm'
          : `/organizations/${organizationId}/students/import-confirm`,
        { method: 'POST', body: JSON.stringify({ rows: studentImportRows }) },
      ),
    onSuccess: async () => {
      setStudentImportRows([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    },
  });
  const previewQuotes = useMutation({
    mutationFn: async () => {
      if (!quoteImportFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', quoteImportFile);
      return api<{ rows: QuoteImportRow[]; total: number; valid: number }>(
        '/admin/quotes/import-preview',
        {
          method: 'POST',
          body: form,
        },
      );
    },
    onSuccess: (data) => setQuoteImportRows(data.rows),
  });
  const confirmQuotes = useMutation({
    mutationFn: () =>
      api<{ created: number; failed: number; total: number }>('/admin/quotes/import-confirm', {
        method: 'POST',
        body: JSON.stringify({ rows: quoteImportRows }),
      }),
    onSuccess: () => {
      setQuoteImportRows([]);
      void queryClient.invalidateQueries({ queryKey: ['admin-content'] });
    },
  });
  const importPastedQuotes = useMutation({
    mutationFn: () =>
      api<{ created: number; failed: number; total: number }>('/admin/quotes/import-text', {
        method: 'POST',
        body: JSON.stringify({ text: quotePaste }),
      }),
    onSuccess: async () => {
      setQuotePaste('');
      await queryClient.invalidateQueries({ queryKey: ['admin-content'] });
    },
  });
  const previewPoints = useMutation({
    mutationFn: async () => {
      if (!pointImportFile) throw new Error('Chọn file CSV hoặc XLSX');
      const form = new FormData();
      form.append('file', pointImportFile);
      return api<{ rows: PointImportRow[]; total: number; valid: number }>(
        `/admin/organizations/${organizationId}/points/import-preview`,
        {
          method: 'POST',
          body: form,
        },
      );
    },
    onSuccess: (data) => setPointImportRows(data.rows),
  });
  const confirmPoints = useMutation({
    mutationFn: () =>
      api<{ applied: number; replayed: number; failed: number; total: number }>(
        `/admin/organizations/${organizationId}/points/import-confirm`,
        {
          method: 'POST',
          body: JSON.stringify({ rows: pointImportRows, batchKey: pointImportBatchKey }),
        },
      ),
    onSuccess: async () => {
      setPointImportRows([]);
      setPointImportBatchKey(crypto.randomUUID());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['audits'] }),
      ]);
    },
  });
  const synchronize = useMutation({
    mutationFn: () =>
      api<{ scope: string; matched: number; queued: number; skipped: number }>(
        '/admin/codeforces-sync',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: syncScope,
            ...(syncScope === 'ORGANIZATION' || !isSystemAdmin ? { organizationId } : {}),
            ...(syncScope === 'USER'
              ? {
                  targetUserId: syncUserId || syncEligibleMembers[0]?.user_id || '',
                }
              : {}),
          }),
        },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
  });
  const recalibrationPreview = useMutation({
    mutationFn: () =>
      api<CcLevelRecalibrationPreview>('/admin/cc-level/recalibration/preview', {
        method: 'POST',
        body: JSON.stringify({
          scope: recalibrationScope,
          ...(recalibrationScope === 'USER'
            ? { targetUserId: recalibrationUserId || selectSyncTarget }
            : {}),
          ...(recalibrationScope === 'ORGANIZATION' || !isSystemAdmin ? { organizationId } : {}),
        }),
      }),
  });
  const applyRecalibration = useMutation({
    mutationFn: () =>
      api<{ total: number; updated: number; skipped: number }>(
        '/admin/cc-level/recalibration/apply',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: recalibrationScope,
            ...(recalibrationScope === 'USER'
              ? { targetUserId: recalibrationUserId || selectSyncTarget }
              : {}),
            ...(recalibrationScope === 'ORGANIZATION' || !isSystemAdmin ? { organizationId } : {}),
            reason: recalibrationReason,
          }),
        },
      ),
    onSuccess: async () => {
      recalibrationPreview.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-summary'] }),
      ]);
    },
  });
  const verifyStudents = useMutation({
    mutationFn: (userIds: string[]) =>
      api<{ requested: number; verified: number; skipped: number }>(
        '/admin/codeforces-accounts/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            userIds,
            reason: reason || 'Admin xác minh Codeforces hàng loạt',
            ...(!isSystemAdmin && organizationId ? { organizationId } : {}),
          }),
        },
      ),
    onSuccess: async () => {
      setSelectedStudentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
      ]);
    },
  });
  const addClassMembersByEmail = useMutation({
    mutationFn: () => {
      const emails = classEmailPaste
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      if (!organizationId) throw new Error('Chọn lớp học trước khi thêm học sinh');
      if (!emails.length) throw new Error('Dán ít nhất một email học sinh');
      return api<{
        requested: number;
        matched: number;
        added: number;
        alreadyInClass: number;
        notFound: string[];
      }>(`/organizations/${organizationId}/members/by-email`, {
        method: 'POST',
        body: JSON.stringify({ emails }),
      });
    },
    onSuccess: async () => {
      setClassEmailPaste('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-members'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      ]);
    },
  });
  if (me.isPending) return <LoadingState label="Đang kiểm tra quyền quản trị…" />;
  if (me.error) return <ErrorState error={me.error} />;
  const memberships =
    me.data?.memberships.filter(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role)) ?? [];
  const organizationOptions = isSystemAdmin
    ? (organizations.data?.organizations
        .filter(({ status }) => status === 'ACTIVE')
        .map((item) => ({
          organization_id: item.id,
          organization_name: item.name,
          role: 'SYSTEM_ADMIN',
        })) ?? [])
    : memberships;
  const selectedOrganization = organizationOptions.find(
    (item) => item.organization_id === organizationId,
  );
  const canApproveHandle = isSystemAdmin || selectedOrganization?.role === 'ORG_ADMIN';
  const noOrganizationSelected =
    !organizationId &&
    ((tab === 'points' && !isSuperAdmin) ||
      tab === 'sync' ||
      (!isSystemAdmin && ['members', 'audit'].includes(tab)));
  const globalStudents =
    users.data?.users.filter((item) => {
      if (
        !['ADMIN', 'SYSTEM_ADMIN'].includes(item.system_role) &&
        item.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role))
      ) {
        return false;
      }
      const memberClasses = item.memberships.filter(({ role }) => role === 'MEMBER');
      if (studentClassFilter === 'UNASSIGNED') return memberClasses.length === 0;
      if (studentClassFilter !== 'ALL') {
        return memberClasses.some(({ organizationId: id }) => id === studentClassFilter);
      }
      return true;
    }) ?? [];
  const accountRows =
    users.data?.users.filter((item) => {
      const search = accountSearch.trim().toLocaleLowerCase('vi');
      if (
        search &&
        ![item.display_name, item.full_name, item.email, item.codeforces_handle ?? ''].some(
          (value) => value.toLocaleLowerCase('vi').includes(search),
        )
      ) {
        return false;
      }
      const classes = item.memberships.filter(({ role }) => role === 'MEMBER');
      if (studentClassFilter === 'UNASSIGNED' && classes.length !== 0) return false;
      if (studentClassFilter !== 'ALL') {
        if (!classes.some(({ organizationId: id }) => id === studentClassFilter)) return false;
      }
      if (accountRiskFilter === 'WARNING' && item.activity_risk_level === 'NORMAL') return false;
      if (
        ['REVIEW', 'PRIORITY'].includes(accountRiskFilter) &&
        item.activity_risk_level !== accountRiskFilter
      )
        return false;
      return true;
    }) ?? [];
  const selectableAccountStudents = accountRows.filter(
    (item) =>
      (['ADMIN', 'SYSTEM_ADMIN'].includes(item.system_role) ||
        !item.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role))) &&
      Boolean(item.codeforces_handle) &&
      item.verification_status === 'UNVERIFIED',
  );
  const warningAccounts = accountRows.filter(
    (item) =>
      item.activity_risk_level !== 'NORMAL' && (isSuperAdmin || item.system_role === 'USER'),
  );
  const verifiableStudents = globalStudents.filter(
    (item) => item.codeforces_handle && item.verification_status === 'UNVERIFIED',
  );
  const syncAccounts: SyncAccount[] =
    isSystemAdmin && syncScope !== 'ORGANIZATION'
      ? globalStudents.map((item) => ({
          user_id: item.id,
          display_name: item.display_name,
          avatar_url: item.avatar_url,
          codeforces_handle: item.codeforces_handle,
          verification_status: item.verification_status,
          current_rating: item.current_rating,
          sync_status: item.sync_status,
          last_sync_at: item.last_sync_at,
          class_label:
            item.memberships
              .filter(({ role }) => role === 'MEMBER')
              .map(({ organizationName }) => organizationName)
              .join(' · ') || 'Không thuộc lớp',
        }))
      : (members.data?.members
          .filter((member) => member.role === 'MEMBER' && member.status === 'ACTIVE')
          .map((member) => ({
            ...member,
            class_label: selectedOrganization?.organization_name ?? '',
          })) ?? []);
  const syncEligibleMembers = syncAccounts.filter(
    (member) => member.verification_status && member.verification_status !== 'UNVERIFIED',
  );
  const syncStatusPriority: Record<string, number> = {
    UNLINKED: 0,
    UNVERIFIED: 1,
    INITIALIZING: 2,
    ERROR: 3,
    QUEUED: 4,
    SYNCING: 5,
    READY: 6,
    INACTIVE: 7,
  };
  const normalizedSyncSearch = syncSearch.trim().toLocaleLowerCase('vi');
  const filteredSyncAccounts = [...syncAccounts]
    .filter((member) => {
      const status = member.sync_status ?? 'UNLINKED';
      if (syncStatusFilter !== 'ALL' && status !== syncStatusFilter) return false;
      if (!normalizedSyncSearch) return true;
      return [member.display_name, member.codeforces_handle ?? '', member.class_label].some(
        (value) => value.toLocaleLowerCase('vi').includes(normalizedSyncSearch),
      );
    })
    .sort((left, right) => {
      const leftStatus = left.sync_status ?? 'UNLINKED';
      const rightStatus = right.sync_status ?? 'UNLINKED';
      const byStatus =
        (syncStatusPriority[leftStatus] ?? 99) - (syncStatusPriority[rightStatus] ?? 99);
      if (byStatus !== 0) return byStatus;
      if (!left.last_sync_at && right.last_sync_at) return -1;
      if (left.last_sync_at && !right.last_sync_at) return 1;
      return left.display_name.localeCompare(right.display_name, 'vi');
    });
  const syncPageSize = 5;
  const syncPageCount = Math.max(1, Math.ceil(filteredSyncAccounts.length / syncPageSize));
  const visibleSyncPage = Math.min(syncPage, syncPageCount);
  const paginatedSyncAccounts = filteredSyncAccounts.slice(
    (visibleSyncPage - 1) * syncPageSize,
    visibleSyncPage * syncPageSize,
  );
  const pointTargets = isSuperAdmin
    ? (users.data?.users.filter((item) => item.status === 'ACTIVE') ?? [])
    : (members.data?.members.filter((item) => item.status === 'ACTIVE') ?? []);
  const selectTarget = pointTargets.some(
    (item) => ('id' in item ? item.id : item.user_id) === targetId,
  )
    ? targetId
    : pointTargets[0]
      ? 'id' in pointTargets[0]
        ? pointTargets[0].id
        : pointTargets[0].user_id
      : '';
  const selectSyncTarget = syncUserId || syncEligibleMembers[0]?.user_id || '';
  const submitPoints = (event: FormEvent) => {
    event.preventDefault();
    if (!selectTarget) return;
    const targetBelongsToSelectedOrganization = isSuperAdmin
      ? users.data?.users
          .find((item) => item.id === selectTarget)
          ?.memberships.some(
            (membership) =>
              membership.organizationId === organizationId && membership.role === 'MEMBER',
          )
      : true;
    mutation.mutate({
      path: `/admin/users/${selectTarget}/points`,
      body: {
        ...(organizationId && targetBelongsToSelectedOrganization ? { organizationId } : {}),
        type: pointType,
        target: pointTarget,
        amount: Math.abs(Number(pointAmount)) * (pointType === 'PENALTY' ? -1 : 1),
        affectsSeason: Boolean(organizationId && targetBelongsToSelectedOrganization),
        reason: pointReason,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };
  const beginRewardEdit = (reward: Reward) => {
    setEditingReward(reward);
    setRewardName(reward.name);
    setRewardDescription(reward.description);
    setRewardCost(reward.cost);
    setRewardStock(reward.stock === null ? '' : String(reward.stock));
    setRewardImageUrl(reward.image_url ?? '');
    setRewardCashValue(reward.cash_value_vnd === null ? '' : String(reward.cash_value_vnd));
    setRewardCategory(reward.category);
    setRewardRequiredLevel(String(reward.required_cc_level));
    setRewardRequiresApproval(reward.requires_approval);
    setRewardAchievementId(reward.achievement_id ?? '');
    setRewardActive(reward.active);
    window.requestAnimationFrame(() =>
      rewardFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  const deleteReward = (reward: Reward) => {
    if (!reward.active) return;
    const action = reward.order_count > 0 ? 'Ẩn' : 'Xoá';
    const detail =
      reward.order_count > 0
        ? 'Quà đã có lịch sử đổi nên sẽ được ẩn và giữ nguyên dữ liệu học sinh.'
        : 'Quà chưa phát sinh yêu cầu đổi và sẽ được xoá khỏi hệ thống.';
    if (!window.confirm(`${action} phần thưởng “${reward.name}”?\n\n${detail}`)) return;
    mutation.mutate({
      path: `/admin/rewards/${reward.id}`,
      method: 'DELETE',
      body: null,
    });
  };
  const tabs = [
    ...(isSystemAdmin
      ? [
          { id: 'accounts', label: 'Tài khoản' },
          { id: 'organizations', label: 'Lớp học' },
        ]
      : []),
    ...(!isSystemAdmin ? [{ id: 'members', label: 'Học sinh' }] : []),
    { id: 'points', label: 'Điểm CC' },
    { id: 'sync', label: 'Đồng bộ CF' },
    ...(isSystemAdmin
      ? [
          { id: 'rewards', label: 'Phần thưởng' },
          { id: 'content', label: 'Nội dung & cấp bậc' },
          { id: 'notifications', label: 'Thông báo' },
          { id: 'leaderboard-links', label: 'Link BXH' },
        ]
      : []),
    { id: 'audit', label: 'Nhật ký' },
  ];
  return (
    <>
      <PageTitle
        eyebrow="CONTROL ROOM"
        title="Quản trị Cầy Cốt"
        detail="Quản lý tài khoản, lớp học, học sinh và nền kinh tế CC Point trong một nơi."
        action={
          <select
            aria-label="Lớp quản trị"
            onChange={(event) => setOrganizationId(event.target.value)}
            value={organizationId}
          >
            {organizationOptions.map((item) => (
              <option key={item.organization_id} value={item.organization_id}>
                {item.organization_name} · {item.role}
              </option>
            ))}
          </select>
        }
      />
      {memberships.length === 0 && !isSystemAdmin ? (
        <EmptyState
          title="Không có quyền quản trị"
          detail="Bạn cần vai trò Teacher hoặc Org Admin."
        />
      ) : (
        <>
          <div className="tabs">
            {tabs.map((item) => (
              <button
                className={tab === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setTab(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          {mutation.error && <p className="notice error">{mutation.error.message}</p>}
          {mutation.isSuccess && (
            <p className="notice success">Thao tác đã hoàn tất và được ghi vào nhật ký.</p>
          )}
          {noOrganizationSelected && (
            <EmptyState
              title="Chưa có lớp học"
              detail="Hãy mở tab Lớp học và tạo lớp đầu tiên trước khi quản lý học sinh."
            />
          )}
          {tab === 'accounts' && isSystemAdmin && (
            <section className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: '/admin/users',
                      body: {
                        email,
                        password,
                        fullName,
                        displayName,
                        systemRole: isSuperAdmin ? newSystemRole : 'USER',
                        leaderboardVisible: newSystemRole === 'USER',
                        mustChangePassword,
                        ...(classId ? { organizationId: classId } : {}),
                        ...(codeforcesHandle ? { codeforcesHandle } : {}),
                      },
                    });
                  }}
                >
                  <p className="eyebrow">NEW ACCOUNT</p>
                  <h2 className="mt-2 text-xl font-black">Tạo tài khoản</h2>
                  <div className="form-grid mt-5">
                    <label className="field">
                      <span>Email</span>
                      <input
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        type="email"
                        value={email}
                      />
                    </label>
                    <label className="field">
                      <span>Mật khẩu tạm</span>
                      <PasswordInput
                        minLength={12}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        value={password}
                      />
                    </label>
                    <label className="field">
                      <span>Họ và tên</span>
                      <input
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        value={fullName}
                      />
                    </label>
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <input
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        value={displayName}
                      />
                    </label>
                    {isSuperAdmin && (
                      <label className="field">
                        <span>Quyền hệ thống</span>
                        <select
                          onChange={(event) =>
                            setNewSystemRole(
                              event.target.value as 'USER' | 'ADMIN' | 'SYSTEM_ADMIN',
                            )
                          }
                          value={newSystemRole}
                        >
                          <option value="USER">Học sinh</option>
                          <option value="ADMIN">Admin</option>
                          <option value="SYSTEM_ADMIN">S-Admin</option>
                        </select>
                      </label>
                    )}
                    <label className="field">
                      <span>Tài khoản Codeforces</span>
                      <input
                        onChange={(e) => setCodeforcesHandle(e.target.value)}
                        pattern="[A-Za-z0-9_.-]{3,24}"
                        placeholder="Có thể để trống"
                        value={codeforcesHandle}
                      />
                    </label>
                    <label className="field form-span-2">
                      <span>Lớp của học sinh</span>
                      <select onChange={(e) => setClassId(e.target.value)} value={classId}>
                        <option value="">Chưa xếp lớp</option>
                        {organizations.data?.organizations
                          .filter(({ status }) => status === 'ACTIVE')
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field form-span-2">
                      <span>Yêu cầu đổi mật khẩu ở lần đăng nhập đầu?</span>
                      <select
                        onChange={(event) => setMustChangePassword(event.target.value === 'YES')}
                        value={mustChangePassword ? 'YES' : 'NO'}
                      >
                        <option value="YES">Có</option>
                        <option value="NO">Không</option>
                      </select>
                    </label>
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    Tạo tài khoản
                  </button>
                </form>
                <form
                  className="panel p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: `/admin/users/${resetUserId}/reset-password`,
                      body: {
                        password: resetPassword,
                        mustChangePassword: resetMustChangePassword,
                        reason: reason || 'Admin đặt lại mật khẩu',
                      },
                    });
                  }}
                >
                  <p className="eyebrow">SECURITY COMMAND</p>
                  <h2 className="mt-2 text-xl font-black">Đặt lại mật khẩu</h2>
                  <label className="field mt-5">
                    <span>Tài khoản</span>
                    <select
                      onChange={(e) => setResetUserId(e.target.value)}
                      required
                      value={resetUserId}
                    >
                      <option value="">Chọn tài khoản</option>
                      {users.data?.users
                        .filter((item) => isSuperAdmin || item.system_role === 'USER')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.display_name} · {item.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field mt-4">
                    <span>Mật khẩu mới</span>
                    <PasswordInput
                      minLength={12}
                      onChange={(e) => setResetPassword(e.target.value)}
                      required
                      value={resetPassword}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Lý do</span>
                    <textarea onChange={(e) => setReason(e.target.value)} value={reason} />
                  </label>
                  <label className="field mt-4">
                    <span>Yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo?</span>
                    <select
                      onChange={(event) => setResetMustChangePassword(event.target.value === 'YES')}
                      value={resetMustChangePassword ? 'YES' : 'NO'}
                    >
                      <option value="YES">Có</option>
                      <option value="NO">Không</option>
                    </select>
                  </label>
                  <button className="button-secondary mt-5" type="submit">
                    Đặt lại & đăng xuất các phiên
                  </button>
                </form>
              </div>
              <form
                className="panel import-panel p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  previewStudents.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK IMPORT</p>
                  <h2 className="mt-2 text-lg font-black">Import tài khoản học sinh</h2>
                  <p className="text-sm text-[var(--muted)]">
                    File có đủ cột lớp học và yêu cầu đổi mật khẩu lần đầu. Slug lớp được phép để
                    trống.
                  </p>
                  <div className="import-column-guide">
                    <span>
                      <strong>lop_hoc_slug</strong> Slug lớp học, có thể để trống
                    </span>
                    <span>
                      <strong>doi_mat_khau_lan_dau</strong> Nhập YES hoặc NO
                    </span>
                  </div>
                  <a
                    className="template-link"
                    download
                    href="/templates/danh-sach-hoc-sinh-mau.csv"
                  >
                    ⇩ Tải file mẫu CSV
                  </a>
                </div>
                <label className="field">
                  <span>File CSV/XLSX</span>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </label>
                <button className="button-secondary" disabled={previewStudents.isPending}>
                  {previewStudents.isPending ? 'Đang đọc file…' : 'Đọc và xem trước'}
                </button>
              </form>
              {previewStudents.error && (
                <p className="notice error">{previewStudents.error.message}</p>
              )}
              <EditableImportTable
                columns={studentImportColumns}
                confirmLabel="Xác nhận tạo tài khoản"
                onChange={setStudentImportRows}
                onConfirm={() => confirmStudents.mutate()}
                pending={confirmStudents.isPending}
                rows={studentImportRows}
              />
              {confirmStudents.error && (
                <p className="notice error">{confirmStudents.error.message}</p>
              )}
              {confirmStudents.data && (
                <p className="notice success">
                  Đã tạo {confirmStudents.data.created}/{confirmStudents.data.total} học sinh; lỗi{' '}
                  {confirmStudents.data.failed}.
                </p>
              )}
              {editingUser && (
                <form
                  className="panel p-6"
                  key={editingUser.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const field = (name: string) => {
                      const value = form.get(name);
                      return typeof value === 'string' ? value : '';
                    };
                    const nextHandle = field('codeforcesHandle').trim();
                    mutation.mutate({
                      path: `/admin/users/${editingUser.id}`,
                      method: 'PATCH',
                      body: {
                        email: field('email'),
                        fullName: field('fullName'),
                        displayName: field('displayName'),
                        classId: field('classId') || null,
                        ...(nextHandle ? { codeforcesHandle: nextHandle } : {}),
                        reason: field('reason'),
                      },
                    });
                  }}
                >
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">EDIT STUDENT</p>
                      <h2>Sửa thông tin học sinh</h2>
                    </div>
                    <button
                      className="button-secondary"
                      onClick={() => setEditingUser(null)}
                      type="button"
                    >
                      Đóng
                    </button>
                  </div>
                  <div className="form-grid mt-5">
                    <label className="field">
                      <span>Email đăng nhập</span>
                      <input defaultValue={editingUser.email} name="email" required type="email" />
                    </label>
                    <label className="field">
                      <span>Họ và tên</span>
                      <input defaultValue={editingUser.full_name} name="fullName" required />
                    </label>
                    <label className="field">
                      <span>Tên hiển thị</span>
                      <input defaultValue={editingUser.display_name} name="displayName" required />
                    </label>
                    <label className="field">
                      <span>Tài khoản Codeforces</span>
                      <input
                        defaultValue={editingUser.codeforces_handle ?? ''}
                        name="codeforcesHandle"
                        pattern="[A-Za-z0-9_.-]{3,24}"
                        placeholder="Chưa liên kết"
                      />
                    </label>
                    <label className="field">
                      <span>Lớp của học sinh</span>
                      <select
                        defaultValue={
                          editingUser.memberships.find(({ role }) => role === 'MEMBER')
                            ?.organizationId ?? ''
                        }
                        name="classId"
                      >
                        <option value="">Chưa xếp lớp</option>
                        {organizations.data?.organizations
                          .filter(({ status }) => status === 'ACTIVE')
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field form-span-2">
                      <span>Lý do cập nhật</span>
                      <textarea
                        defaultValue="Admin cập nhật hồ sơ học sinh"
                        minLength={3}
                        name="reason"
                        required
                      />
                    </label>
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    Lưu thông tin học sinh
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                <div className="management-header account-management-header">
                  <div>
                    <strong>
                      {accountRows.length}/{users.data?.total ?? 0} tài khoản
                    </strong>
                    <span>Tìm kiếm, lọc lớp, chọn học sinh và xác minh Codeforces</span>
                  </div>
                  <div className="account-filter-bar">
                    <label className="field compact-field">
                      <span>Tìm tài khoản</span>
                      <input
                        onChange={(event) => {
                          setAccountSearch(event.target.value);
                          setSelectedStudentIds([]);
                        }}
                        placeholder="Tên, email hoặc tài khoản CF"
                        type="search"
                        value={accountSearch}
                      />
                    </label>
                    <label className="field compact-field">
                      <span>Lọc theo lớp</span>
                      <select
                        onChange={(event) => {
                          setStudentClassFilter(event.target.value);
                          setSelectedStudentIds([]);
                        }}
                        value={studentClassFilter}
                      >
                        <option value="ALL">Tất cả lớp</option>
                        <option value="UNASSIGNED">Chưa xếp lớp</option>
                        {organizations.data?.organizations
                          .filter(({ status }) => status === 'ACTIVE')
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field compact-field">
                      <span>Lọc cảnh báo</span>
                      <select
                        onChange={(event) => {
                          setAccountRiskFilter(event.target.value);
                          setSelectedStudentIds([]);
                        }}
                        value={accountRiskFilter}
                      >
                        <option value="ALL">Tất cả trạng thái</option>
                        <option value="WARNING">Tất cả tài khoản cảnh báo</option>
                        <option value="REVIEW">Cần kiểm tra</option>
                        <option value="PRIORITY">Ưu tiên kiểm tra</option>
                      </select>
                    </label>
                    <button
                      className="button-secondary"
                      disabled={!selectableAccountStudents.length}
                      onClick={() =>
                        setSelectedStudentIds(selectableAccountStudents.map((item) => item.id))
                      }
                      type="button"
                    >
                      Chọn HS chưa xác minh
                    </button>
                    <button
                      className="button-primary"
                      disabled={!selectedStudentIds.length || verifyStudents.isPending}
                      onClick={() => verifyStudents.mutate(selectedStudentIds)}
                      type="button"
                    >
                      Xác minh CF ({selectedStudentIds.length})
                    </button>
                    <button
                      className="button-secondary"
                      disabled={!warningAccounts.length || mutation.isPending}
                      onClick={() => {
                        const note = window.prompt(
                          `Xác nhận hợp lệ ${warningAccounts.length} tài khoản đang hiển thị. Ghi chú:`,
                          'Đã kiểm tra lịch sử và xác nhận các hoạt động hợp lệ',
                        );
                        if (!note) return;
                        mutation.mutate({
                          path: '/admin/users/activity-risk/review-all',
                          body: { userIds: warningAccounts.map((item) => item.id), note },
                        });
                      }}
                      type="button"
                    >
                      Xác nhận hợp lệ tất cả ({warningAccounts.length})
                    </button>
                  </div>
                </div>
                {verifyStudents.error && (
                  <p className="notice error">{verifyStudents.error.message}</p>
                )}
                {users.isPending ? (
                  <LoadingState label="Đang tải tài khoản…" />
                ) : (
                  accountRows.map((item) => {
                    const isStudent =
                      ['ADMIN', 'SYSTEM_ADMIN'].includes(item.system_role) ||
                      !item.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role));
                    const canVerify =
                      isStudent &&
                      Boolean(item.codeforces_handle) &&
                      item.verification_status === 'UNVERIFIED';
                    const checked = selectedStudentIds.includes(item.id);
                    const isPrivileged = ['ADMIN', 'SYSTEM_ADMIN'].includes(item.system_role);
                    const canManageAccount = isSuperAdmin || !isPrivileged;
                    const canChangeRankVisibility =
                      isSuperAdmin || item.id === session.data?.user.userId;
                    return (
                      <div className="account-row" key={item.id}>
                        <div className="member">
                          {isStudent && (
                            <input
                              aria-label={`Chọn ${item.display_name}`}
                              checked={checked}
                              className="student-checkbox"
                              disabled={!canVerify}
                              onChange={() =>
                                setSelectedStudentIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== item.id)
                                    : [...current, item.id],
                                )
                              }
                              type="checkbox"
                            />
                          )}
                          {isStudent ? (
                            <Link to={`/students/${item.id}`}>
                              <Avatar
                                name={item.display_name}
                                rating={item.current_rating}
                                size="sm"
                                url={item.avatar_url}
                              />
                            </Link>
                          ) : (
                            <Avatar
                              name={item.display_name}
                              rating={item.current_rating}
                              size="sm"
                              url={item.avatar_url}
                            />
                          )}
                          <div>
                            {isStudent ? (
                              <Link
                                className="student-profile-name-link"
                                to={`/students/${item.id}`}
                              >
                                {item.display_name}
                              </Link>
                            ) : (
                              <strong>{item.display_name}</strong>
                            )}
                            {item.activity_risk_level !== 'NORMAL' && (
                              <span
                                className={`activity-risk-badge ${item.activity_risk_level.toLowerCase()}`}
                                title={`Điểm cảnh báo: ${item.activity_risk_score}`}
                              >
                                ⚠{' '}
                                {item.activity_risk_level === 'PRIORITY'
                                  ? 'Ưu tiên kiểm tra'
                                  : 'Cần kiểm tra'}
                              </span>
                            )}
                            <p>
                              {item.email} · CC Level {formatNumber(item.cc_level ?? 800)} ·{' '}
                              {item.memberships.length} lớp
                            </p>
                            {item.must_change_password && (
                              <p className="pending-copy">Phải đổi mật khẩu khi đăng nhập</p>
                            )}
                            {item.codeforces_handle && (
                              <CodeforcesHandle
                                handle={item.codeforces_handle}
                                rating={item.current_rating}
                              />
                            )}
                            {item.pending_handle && (
                              <p className="pending-copy">Chờ duyệt: @{item.pending_handle}</p>
                            )}
                          </div>
                        </div>
                        <select
                          aria-label={`Trạng thái ${item.display_name}`}
                          onChange={(e) =>
                            mutation.mutate({
                              path: `/admin/users/${item.id}`,
                              method: 'PATCH',
                              body: {
                                status: e.target.value,
                                reason: 'Cập nhật trạng thái từ trang quản trị',
                              },
                            })
                          }
                          value={item.status}
                          disabled={!canManageAccount}
                        >
                          <option>ACTIVE</option>
                          <option>INACTIVE</option>
                          <option>SUSPENDED</option>
                        </select>
                        <select
                          aria-label={`Quyền ${item.display_name}`}
                          onChange={(e) =>
                            mutation.mutate({
                              path: `/admin/users/${item.id}`,
                              method: 'PATCH',
                              body: {
                                systemRole: e.target.value,
                                leaderboardVisible: e.target.value === 'USER',
                                reason: 'Cập nhật quyền hệ thống từ trang quản trị',
                              },
                            })
                          }
                          value={item.system_role}
                          disabled={!isSuperAdmin}
                        >
                          <option value="USER">Học sinh</option>
                          <option value="ADMIN">Admin</option>
                          <option value="SYSTEM_ADMIN">S-Admin</option>
                        </select>
                        {isPrivileged && (
                          <label className="leaderboard-visibility-toggle">
                            <input
                              checked={item.leaderboard_visible}
                              disabled={!canChangeRankVisibility}
                              onChange={(event) =>
                                mutation.mutate({
                                  path: `/admin/users/${item.id}`,
                                  method: 'PATCH',
                                  body: {
                                    leaderboardVisible: event.target.checked,
                                    reason:
                                      'Cập nhật hiển thị tài khoản quản trị trên bảng xếp hạng',
                                  },
                                })
                              }
                              type="checkbox"
                            />
                            Hiện trên BXH
                          </label>
                        )}
                        <div className="compact-actions">
                          {canManageAccount && item.activity_risk_level !== 'NORMAL' && (
                            <button
                              className="button-secondary"
                              onClick={() => {
                                const note = window.prompt(
                                  'Ghi chú xác nhận hoạt động hợp lệ:',
                                  'Đã kiểm tra lịch sử bài giải và xác nhận hợp lệ',
                                );
                                if (!note) return;
                                mutation.mutate({
                                  path: `/admin/users/${item.id}/activity-risk/review`,
                                  body: { resolution: 'VALID', note },
                                });
                              }}
                              type="button"
                            >
                              Xác nhận hợp lệ
                            </button>
                          )}
                          {canManageAccount && (
                            <button
                              className="button-secondary"
                              onClick={() => setEditingUser(item)}
                              type="button"
                            >
                              Sửa
                            </button>
                          )}
                          {canManageAccount && item.id !== session.data?.user.userId && (
                            <button
                              className="button-danger"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Xoá tài khoản “${item.display_name}”? Tài khoản sẽ bị khoá và được đưa ra khỏi tất cả lớp.`,
                                  )
                                )
                                  return;
                                mutation.mutate({
                                  path: `/admin/users/${item.id}`,
                                  method: 'DELETE',
                                  body: { reason: 'Admin xoá tài khoản khỏi hệ thống' },
                                });
                              }}
                              type="button"
                            >
                              Xoá
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {tab === 'organizations' && isSystemAdmin && (
            <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/organizations',
                    body: {
                      name: organizationName,
                      slug: organizationSlug,
                      visibility: 'PRIVATE',
                      timezone: 'Asia/Ho_Chi_Minh',
                    },
                  });
                }}
              >
                <p className="eyebrow">NEW ORGANIZATION</p>
                <h2 className="mt-2 text-xl font-black">Tạo lớp học</h2>
                <label className="field mt-5">
                  <span>Tên lớp học</span>
                  <input
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                    value={organizationName}
                  />
                </label>
                <label className="field mt-4">
                  <span>Slug</span>
                  <input
                    onChange={(e) =>
                      setOrganizationSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                    }
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    required
                    value={organizationSlug}
                  />
                </label>
                <button className="button-primary mt-5" type="submit">
                  Tạo lớp học
                </button>
              </form>
              <div className="space-y-4">
                {editingOrganization && (
                  <form
                    className="panel p-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      mutation.mutate({
                        path: `/admin/organizations/${editingOrganization.id}`,
                        method: 'PATCH',
                        body: {
                          name: formText(form, 'name'),
                          slug: formText(form, 'slug'),
                          visibility: formText(form, 'visibility', 'PRIVATE'),
                          status: formText(form, 'status', 'ACTIVE'),
                          reason: 'Admin sửa thông tin lớp học',
                        },
                      });
                      setEditingOrganization(null);
                    }}
                  >
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">EDIT CLASS</p>
                        <h2>Sửa lớp học</h2>
                      </div>
                      <button
                        className="button-secondary"
                        onClick={() => setEditingOrganization(null)}
                        type="button"
                      >
                        Huỷ
                      </button>
                    </div>
                    <div className="form-grid mt-4">
                      <label className="field">
                        <span>Tên lớp học</span>
                        <input defaultValue={editingOrganization.name} name="name" required />
                      </label>
                      <label className="field">
                        <span>Slug lớp học</span>
                        <input
                          defaultValue={editingOrganization.slug}
                          name="slug"
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Phạm vi hiển thị</span>
                        <select defaultValue={editingOrganization.visibility} name="visibility">
                          <option>PUBLIC</option>
                          <option>CLOSED</option>
                          <option>PRIVATE</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Trạng thái</span>
                        <select defaultValue={editingOrganization.status} name="status">
                          <option>ACTIVE</option>
                          <option>INACTIVE</option>
                        </select>
                      </label>
                    </div>
                    <button className="button-primary mt-4" type="submit">
                      Lưu lớp học
                    </button>
                  </form>
                )}
                <div className="panel overflow-hidden">
                  {organizations.data?.organizations.map((item) => (
                    <div className="organization-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          @{item.slug} · {item.member_count} thành viên · {item.active_seasons} mùa
                          active
                        </p>
                      </div>
                      <select
                        aria-label={`Hiển thị ${item.name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/admin/organizations/${item.id}`,
                            method: 'PATCH',
                            body: {
                              visibility: e.target.value,
                              reason: 'Cập nhật hiển thị tổ chức',
                            },
                          })
                        }
                        value={item.visibility}
                      >
                        <option>PUBLIC</option>
                        <option>CLOSED</option>
                        <option>PRIVATE</option>
                      </select>
                      <select
                        aria-label={`Trạng thái ${item.name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/admin/organizations/${item.id}`,
                            method: 'PATCH',
                            body: { status: e.target.value, reason: 'Cập nhật trạng thái tổ chức' },
                          })
                        }
                        value={item.status}
                      >
                        <option>ACTIVE</option>
                        <option>INACTIVE</option>
                      </select>
                      <div className="compact-actions">
                        <button
                          className="button-secondary"
                          onClick={() => setEditingOrganization(item)}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          disabled={item.status === 'INACTIVE'}
                          onClick={() => {
                            if (!window.confirm(`Lưu trữ lớp “${item.name}”?`)) return;
                            mutation.mutate({
                              path: `/admin/organizations/${item.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          {item.status === 'INACTIVE' ? 'Đã lưu trữ' : 'Xoá'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <section className="panel class-student-manager p-6 xl:col-span-2">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">THÀNH VIÊN LỚP HỌC</p>
                    <h2>Danh sách và điều chuyển học sinh</h2>
                  </div>
                  <label className="field class-picker">
                    <span>Lớp đang quản lý</span>
                    <select
                      onChange={(event) => setOrganizationId(event.target.value)}
                      value={organizationId}
                    >
                      <option value="">Chọn lớp học</option>
                      {organizations.data?.organizations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {organizationId && (
                  <>
                    <form
                      className="class-member-add"
                      onSubmit={(event) => {
                        event.preventDefault();
                        mutation.mutate({
                          path: `/organizations/${organizationId}/members`,
                          body: { userId: memberUserId, role: 'MEMBER' },
                        });
                        setMemberUserId('');
                      }}
                    >
                      <label className="field">
                        <span>Thêm học sinh vào lớp</span>
                        <select
                          onChange={(event) => setMemberUserId(event.target.value)}
                          required
                          value={memberUserId}
                        >
                          <option value="">Chọn học sinh</option>
                          {globalStudents
                            .filter(
                              (student) =>
                                !student.memberships.some(
                                  (item) =>
                                    item.organizationId === organizationId &&
                                    item.role === 'MEMBER',
                                ),
                            )
                            .map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.display_name} · {student.email}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button className="button-primary" disabled={!memberUserId} type="submit">
                        Thêm vào lớp
                      </button>
                    </form>
                    <form
                      className="class-member-bulk-add"
                      onSubmit={(event) => {
                        event.preventDefault();
                        addClassMembersByEmail.mutate();
                      }}
                    >
                      <label className="field">
                        <span>Thêm nhiều học sinh bằng email</span>
                        <textarea
                          onChange={(event) => setClassEmailPaste(event.target.value)}
                          placeholder={'hocsinh1@example.com\nhocsinh2@example.com'}
                          rows={4}
                          value={classEmailPaste}
                        />
                        <small>
                          Dán email cách nhau bằng dấu phẩy, dấu chấm phẩy hoặc xuống dòng.
                        </small>
                      </label>
                      <button
                        className="button-secondary"
                        disabled={!classEmailPaste.trim() || addClassMembersByEmail.isPending}
                        type="submit"
                      >
                        {addClassMembersByEmail.isPending ? 'Đang thêm…' : 'Thêm danh sách vào lớp'}
                      </button>
                    </form>
                    {addClassMembersByEmail.error && (
                      <p className="notice error">{addClassMembersByEmail.error.message}</p>
                    )}
                    {addClassMembersByEmail.data && (
                      <p className="notice success">
                        Đã thêm {addClassMembersByEmail.data.added}/
                        {addClassMembersByEmail.data.requested} học sinh;{' '}
                        {addClassMembersByEmail.data.alreadyInClass} tài khoản đã có trong lớp.
                        {addClassMembersByEmail.data.notFound.length
                          ? ` Không tìm thấy: ${addClassMembersByEmail.data.notFound.join(', ')}.`
                          : ''}
                      </p>
                    )}
                    <div className="class-member-list">
                      {members.isPending ? (
                        <LoadingState label="Đang tải danh sách lớp…" />
                      ) : members.data?.members.filter(
                          (member) => member.role === 'MEMBER' && member.status === 'ACTIVE',
                        ).length ? (
                        members.data.members
                          .filter(
                            (member) => member.role === 'MEMBER' && member.status === 'ACTIVE',
                          )
                          .map((member) => (
                            <div className="class-member-row" key={member.user_id}>
                              <div className="member">
                                <Avatar
                                  name={member.display_name}
                                  rating={member.current_rating}
                                  size="sm"
                                  url={member.avatar_url}
                                />
                                <div>
                                  <strong>{member.display_name}</strong>
                                  <p>
                                    {member.full_name} · {member.email}
                                  </p>
                                </div>
                              </div>
                              <span>⚡ {formatNumber(member.cc_level, 2)}</span>
                              <button
                                className="button-danger"
                                onClick={() => {
                                  if (!window.confirm(`Đưa “${member.display_name}” ra khỏi lớp?`))
                                    return;
                                  mutation.mutate({
                                    path: `/organizations/${organizationId}/members/${member.user_id}`,
                                    method: 'PATCH',
                                    body: {
                                      status: 'LEFT',
                                      reason: 'Admin đưa học sinh ra khỏi lớp',
                                    },
                                  });
                                }}
                                type="button"
                              >
                                Xoá khỏi lớp
                              </button>
                            </div>
                          ))
                      ) : (
                        <EmptyState
                          title="Lớp chưa có học sinh"
                          detail="Chọn học sinh ở phía trên để thêm vào lớp."
                        />
                      )}
                    </div>
                  </>
                )}
              </section>
            </section>
          )}
          {tab === 'members' && isSystemAdmin && (
            <section className="space-y-4">
              <div className="panel student-command-bar p-4">
                <label className="field">
                  <span>Phạm vi học sinh</span>
                  <select
                    onChange={(event) => {
                      setStudentClassFilter(event.target.value);
                      setSelectedStudentIds([]);
                    }}
                    value={studentClassFilter}
                  >
                    <option value="ALL">Tất cả học sinh</option>
                    <option value="UNASSIGNED">Chưa xếp lớp</option>
                    {organizations.data?.organizations
                      .filter(({ status }) => status === 'ACTIVE')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="student-selection-summary">
                  <strong>{globalStudents.length} học sinh</strong>
                  <span>{selectedStudentIds.length} tài khoản đang chọn</span>
                </div>
                <button
                  className="button-secondary"
                  disabled={verifiableStudents.length === 0}
                  onClick={() =>
                    setSelectedStudentIds(verifiableStudents.map((student) => student.id))
                  }
                  type="button"
                >
                  Chọn tất cả chưa xác minh
                </button>
                <button
                  className="button-primary"
                  disabled={selectedStudentIds.length === 0 || verifyStudents.isPending}
                  onClick={() => verifyStudents.mutate(selectedStudentIds)}
                  type="button"
                >
                  {verifyStudents.isPending
                    ? 'Đang xác minh…'
                    : `Xác minh CF (${selectedStudentIds.length})`}
                </button>
              </div>
              {verifyStudents.error && (
                <p className="notice error">{verifyStudents.error.message}</p>
              )}
              {verifyStudents.data && (
                <p className="notice success">
                  Đã xác minh {verifyStudents.data.verified}/{verifyStudents.data.requested} tài
                  khoản; bỏ qua {verifyStudents.data.skipped}.
                </p>
              )}
              {!isSystemAdmin && organizationId && (
                <form
                  className="panel import-panel p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    previewStudents.mutate();
                  }}
                >
                  <div>
                    <p className="eyebrow">BULK IMPORT</p>
                    <h2 className="mt-2 text-lg font-black">Import học sinh vào lớp đang chọn</h2>
                    <a
                      className="template-link"
                      download
                      href="/templates/danh-sach-hoc-sinh-mau.csv"
                    >
                      ⇩ Tải file mẫu CSV
                    </a>
                  </div>
                  <label className="field">
                    <span>File CSV/XLSX</span>
                    <input
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                      required
                      type="file"
                    />
                  </label>
                  <button className="button-secondary" disabled={previewStudents.isPending}>
                    {previewStudents.isPending ? 'Đang import…' : 'Import'}
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Danh sách học sinh</strong>
                  <span>Học sinh có thể chưa thuộc lớp nào</span>
                </div>
                {users.isPending ? (
                  <LoadingState label="Đang tải học sinh…" />
                ) : globalStudents.length === 0 ? (
                  <EmptyState
                    title="Chưa có học sinh"
                    detail="Tạo tài khoản học sinh mới hoặc thay đổi bộ lọc lớp."
                  />
                ) : (
                  globalStudents.map((student) => {
                    const canVerify =
                      Boolean(student.codeforces_handle) &&
                      student.verification_status === 'UNVERIFIED';
                    const checked = selectedStudentIds.includes(student.id);
                    const classes = student.memberships
                      .filter(({ role }) => role === 'MEMBER')
                      .map(({ organizationName }) => organizationName);
                    return (
                      <div className="global-student-row" key={student.id}>
                        <input
                          aria-label={`Chọn ${student.display_name}`}
                          checked={checked}
                          className="student-checkbox"
                          disabled={!canVerify}
                          onChange={() =>
                            setSelectedStudentIds((current) =>
                              checked
                                ? current.filter((id) => id !== student.id)
                                : [...current, student.id],
                            )
                          }
                          type="checkbox"
                        />
                        <div className="member">
                          <Avatar
                            name={student.display_name}
                            rating={student.current_rating}
                            size="sm"
                            url={student.avatar_url}
                          />
                          <div>
                            <strong>{student.display_name}</strong>
                            <p>
                              {student.full_name} · {student.email}
                            </p>
                            <p>{classes.length ? classes.join(', ') : 'Chưa xếp lớp'}</p>
                            {student.codeforces_handle && (
                              <CodeforcesHandle
                                handle={student.codeforces_handle}
                                rating={student.current_rating}
                              />
                            )}
                            {student.pending_handle && (
                              <p className="pending-copy">Yêu cầu đổi: @{student.pending_handle}</p>
                            )}
                          </div>
                        </div>
                        <div className="student-metrics">
                          <span>⚡ {formatNumber(student.cc_level, 2)}</span>
                          <span>◆ {formatNumber(student.cc_point, 2)}</span>
                          <span>◈ {formatNumber(student.cc_balance, 2)}</span>
                        </div>
                        <div className="student-actions">
                          {student.pending_handle ? (
                            <>
                              <button
                                className="button-primary"
                                onClick={() =>
                                  mutation.mutate({
                                    path: `/admin/codeforces-accounts/${student.id}/approve-change`,
                                    body: { reason: reason || 'Admin duyệt đổi Codeforces handle' },
                                  })
                                }
                                type="button"
                              >
                                Duyệt đổi CF
                              </button>
                              <button
                                className="button-secondary"
                                onClick={() =>
                                  mutation.mutate({
                                    path: `/admin/codeforces-accounts/${student.id}/reject-change`,
                                    body: {
                                      reason: reason || 'Admin từ chối đổi Codeforces handle',
                                    },
                                  })
                                }
                                type="button"
                              >
                                Từ chối
                              </button>
                            </>
                          ) : canVerify ? (
                            <button
                              className="button-secondary"
                              onClick={() => verifyStudents.mutate([student.id])}
                              type="button"
                            >
                              Xác minh CF
                            </button>
                          ) : student.verification_status ? (
                            <StatusPill value={student.verification_status} />
                          ) : (
                            <span className="text-xs text-[var(--muted)]">Chưa có CF</span>
                          )}
                          <button
                            className="button-secondary"
                            onClick={() => {
                              setEditingUser(student);
                              setTab('accounts');
                            }}
                            type="button"
                          >
                            Sửa
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {tab === 'members' && !isSystemAdmin && !noOrganizationSelected && (
            <section className="space-y-4">
              <div className="panel student-command-bar p-4">
                <div className="student-selection-summary">
                  <strong>{members.data?.members.length ?? 0} học sinh trong lớp</strong>
                  <span>{selectedStudentIds.length} tài khoản đang chọn</span>
                </div>
                <button
                  className="button-secondary"
                  disabled={verifiableMembers.length === 0}
                  onClick={() =>
                    setSelectedStudentIds(verifiableMembers.map((student) => student.user_id))
                  }
                  type="button"
                >
                  Chọn tất cả chưa xác minh
                </button>
                <button
                  className="button-primary"
                  disabled={selectedStudentIds.length === 0 || verifyStudents.isPending}
                  onClick={() => verifyStudents.mutate(selectedStudentIds)}
                  type="button"
                >
                  Xác minh CF ({selectedStudentIds.length})
                </button>
              </div>
              <form
                className="panel import-panel p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  previewStudents.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK IMPORT</p>
                  <h2 className="mt-2 text-xl font-black">Import danh sách học sinh</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Nhận CSV/XLSX, tối đa 500 học sinh. Tài khoản được thêm trực tiếp vào lớp đang
                    chọn.
                  </p>
                  <a
                    className="template-link"
                    download
                    href="/templates/danh-sach-hoc-sinh-mau.csv"
                  >
                    ⇩ Tải file mẫu CSV
                  </a>
                </div>
                <label className="field">
                  <span>File danh sách</span>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={!organizationId || previewStudents.isPending}
                  type="submit"
                >
                  {previewStudents.isPending ? 'Đang đọc file…' : 'Đọc và xem trước'}
                </button>
              </form>
              {previewStudents.error && (
                <p className="notice error">{previewStudents.error.message}</p>
              )}
              <EditableImportTable
                columns={studentImportColumns.filter((column) => column.key !== 'classSlug')}
                confirmLabel="Xác nhận import vào lớp"
                onChange={setStudentImportRows}
                onConfirm={() => confirmStudents.mutate()}
                pending={confirmStudents.isPending}
                rows={studentImportRows}
              />
              {confirmStudents.error && (
                <p className="notice error">{confirmStudents.error.message}</p>
              )}
              {confirmStudents.data && (
                <p className="notice success">
                  Đã tạo {confirmStudents.data.created}/{confirmStudents.data.total} học sinh; lỗi{' '}
                  {confirmStudents.data.failed}.
                </p>
              )}
              {isSystemAdmin && (
                <form
                  className="panel member-add-form p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: `/organizations/${organizationId}/members`,
                      body: { userId: memberUserId, role: memberRole },
                    });
                  }}
                >
                  <label className="field">
                    <span>Thêm tài khoản vào lớp</span>
                    <select
                      onChange={(event) => setMemberUserId(event.target.value)}
                      required
                      value={memberUserId}
                    >
                      <option value="">Chọn tài khoản</option>
                      {users.data?.users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.display_name} · {item.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Vai trò trong lớp</span>
                    <select
                      onChange={(event) => setMemberRole(event.target.value)}
                      value={memberRole}
                    >
                      <option>MEMBER</option>
                      <option>TEACHER</option>
                      <option>ORG_ADMIN</option>
                    </select>
                  </label>
                  <button className="button-primary" type="submit">
                    Thêm vào lớp
                  </button>
                </form>
              )}
              <div className="panel overflow-hidden">
                {members.isPending ? (
                  <LoadingState label="Đang tải thành viên…" />
                ) : !members.data?.members.length ? (
                  <EmptyState
                    title="Chưa có học sinh"
                    detail="Thêm từng tài khoản hoặc import danh sách CSV/XLSX."
                  />
                ) : (
                  members.data.members.map((member) => (
                    <div className="admin-row student-row" key={member.user_id}>
                      <input
                        aria-label={`Chọn ${member.display_name}`}
                        checked={selectedStudentIds.includes(member.user_id)}
                        className="student-checkbox"
                        disabled={
                          !member.codeforces_handle || member.verification_status !== 'UNVERIFIED'
                        }
                        onChange={() =>
                          setSelectedStudentIds((current) =>
                            current.includes(member.user_id)
                              ? current.filter((id) => id !== member.user_id)
                              : [...current, member.user_id],
                          )
                        }
                        type="checkbox"
                      />
                      <div className="member">
                        <Avatar
                          name={member.display_name}
                          rating={member.current_rating}
                          size="sm"
                          url={member.avatar_url}
                        />
                        <div>
                          <strong>{member.display_name}</strong>
                          <p>
                            {member.full_name} · {member.email}
                          </p>
                          <p>CC Level {member.cc_level ?? '800'}</p>
                          {member.codeforces_handle && (
                            <CodeforcesHandle
                              handle={member.codeforces_handle}
                              rating={member.current_rating}
                            />
                          )}
                          {member.pending_handle && (
                            <p className="pending-copy">Yêu cầu đổi: @{member.pending_handle}</p>
                          )}
                        </div>
                      </div>
                      <StatusPill value={member.status} />
                      <select
                        aria-label={`Vai trò ${member.display_name}`}
                        onChange={(e) =>
                          mutation.mutate({
                            path: `/organizations/${organizationId}/members/${member.user_id}`,
                            method: 'PATCH',
                            body: {
                              role: e.target.value,
                              reason: 'Cập nhật vai trò từ trang quản trị',
                            },
                          })
                        }
                        value={member.role}
                      >
                        <option>MEMBER</option>
                        <option>TEACHER</option>
                        <option>ORG_ADMIN</option>
                      </select>
                      <div className="student-actions">
                        {member.pending_handle && canApproveHandle ? (
                          <>
                            <button
                              className="button-primary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/approve-change`,
                                  body: { reason: reason || 'Admin duyệt đổi Codeforces handle' },
                                })
                              }
                              type="button"
                            >
                              Duyệt đổi CF
                            </button>
                            <button
                              className="button-secondary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/reject-change`,
                                  body: { reason: reason || 'Admin từ chối đổi Codeforces handle' },
                                })
                              }
                              type="button"
                            >
                              Từ chối
                            </button>
                          </>
                        ) : member.verification_status === 'UNVERIFIED' ? (
                          <button
                            className="button-secondary"
                            onClick={() =>
                              mutation.mutate({
                                path: `/organizations/${organizationId}/codeforces-accounts/${member.user_id}/verify`,
                                body: { reason: reason || 'Xác minh trực tiếp bởi giáo viên' },
                              })
                            }
                            type="button"
                          >
                            Xác minh CF
                          </button>
                        ) : member.verification_status ? (
                          <StatusPill value={member.verification_status} />
                        ) : (
                          <span className="text-xs text-[var(--muted)]">Chưa có Codeforces</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'points' && (!noOrganizationSelected || isSuperAdmin) && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <form className="panel p-6" onSubmit={submitPoints}>
                  <p className="eyebrow">CC POINT COMMAND</p>
                  <h2 className="mt-2 text-xl font-black">Cộng / trừ một tài khoản</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Chọn điều chỉnh riêng CC Point, riêng CC Balance hoặc cả hai. Mỗi lệnh có khóa
                    chống ghi trùng, được lưu nhật ký và gửi thông báo tới tài khoản liên quan.
                  </p>
                  <button
                    className="template-link mt-3"
                    onClick={() =>
                      document
                        .getElementById('bulk-cc-point-import')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                    type="button"
                  >
                    ⇩ Import hàng loạt bằng CSV / Excel (.xlsx)
                  </button>
                  <label className="field mt-5">
                    <span>Tài khoản nhận điểm</span>
                    <select onChange={(e) => setTargetId(e.target.value)} value={selectTarget}>
                      {pointTargets.map((member) => {
                        const id = 'id' in member ? member.id : member.user_id;
                        return (
                          <option key={id} value={id}>
                            {member.display_name}
                            {'system_role' in member && member.system_role !== 'USER'
                              ? ` · ${member.system_role === 'SYSTEM_ADMIN' ? 'S-Admin' : 'Admin'}`
                              : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Chỉ số được điều chỉnh</span>
                      <select
                        onChange={(event) =>
                          setPointTarget(event.target.value as 'CC_POINT' | 'CC_BALANCE' | 'BOTH')
                        }
                        value={pointTarget}
                      >
                        <option value="CC_POINT">Chỉ CC Point</option>
                        <option value="CC_BALANCE">Chỉ CC Balance</option>
                        <option value="BOTH">CC Point và CC Balance</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Loại</span>
                      <select onChange={(e) => setPointType(e.target.value)} value={pointType}>
                        <option value="BONUS">CỘNG</option>
                        <option value="PENALTY">TRỪ</option>
                        <option value="ADJUSTMENT">ĐIỀU CHỈNH</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Số lượng thay đổi</span>
                      <input
                        min="0.01"
                        onChange={(e) => setPointAmount(e.target.value)}
                        required
                        step="0.01"
                        type="number"
                        value={pointAmount}
                      />
                    </label>
                  </div>
                  <label className="field mt-4">
                    <span>Lý do bắt buộc</span>
                    <textarea
                      minLength={3}
                      onChange={(e) => setPointReason(e.target.value)}
                      required
                      value={pointReason}
                    />
                  </label>
                  <button className="button-primary mt-5" disabled={!selectTarget} type="submit">
                    Ghi giao dịch
                  </button>
                </form>
              </div>

              <form
                className="panel import-panel p-6"
                id="bulk-cc-point-import"
                onSubmit={(event) => {
                  event.preventDefault();
                  previewPoints.mutate();
                }}
              >
                <div>
                  <p className="eyebrow">BULK CC POINT</p>
                  <h2 className="mt-2 text-xl font-black">Cộng / trừ hàng loạt</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Nhận file CSV hoặc Excel (.xlsx), tối đa 500 tài khoản. Cột thao tác dùng
                    CỘNG/TRỪ; cột chỉ số chọn CC_POINT, CC_BALANCE hoặc BOTH. Số lượng luôn nhập số
                    dương. Tải lại cùng một file sẽ không ghi trùng giao dịch đã thành công.
                  </p>
                </div>
                <div className="import-actions">
                  <a
                    className="button-secondary"
                    download
                    href="/templates/cong-tru-cc-point-mau.csv"
                  >
                    ↓ Tải file mẫu
                  </a>
                  <label className="button-secondary avatar-file-button">
                    Chọn CSV / XLSX
                    <input
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => setPointImportFile(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                  <span className="import-filename">
                    {pointImportFile?.name ?? 'Chưa chọn file'}
                  </span>
                  <button
                    className="button-primary"
                    disabled={!pointImportFile || previewPoints.isPending}
                    type="submit"
                  >
                    {previewPoints.isPending ? 'Đang đọc file…' : 'Đọc và xem trước'}
                  </button>
                </div>
                {previewPoints.error && (
                  <p className="notice error">{previewPoints.error.message}</p>
                )}
                <EditableImportTable
                  columns={pointImportColumns}
                  confirmLabel="Xác nhận cộng / trừ điểm"
                  onChange={setPointImportRows}
                  onConfirm={() => confirmPoints.mutate()}
                  pending={confirmPoints.isPending}
                  rows={pointImportRows}
                />
                {confirmPoints.error && (
                  <p className="notice error">{confirmPoints.error.message}</p>
                )}
                {confirmPoints.data && (
                  <div className="notice success">
                    Đã ghi {confirmPoints.data.applied} · Bỏ qua trùng {confirmPoints.data.replayed}{' '}
                    · Lỗi {confirmPoints.data.failed}
                  </div>
                )}
              </form>
            </div>
          )}
          {tab === 'sync' && !noOrganizationSelected && (
            <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <form
                className="panel p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  synchronize.mutate();
                }}
              >
                <p className="eyebrow">CODEFORCES SYNC CONTROL</p>
                <h2 className="mt-2 text-xl font-black">Chọn phạm vi đồng bộ</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Chỉ các tài khoản Codeforces đã xác minh và đang hoạt động mới được đưa vào hàng
                  đợi. Tài khoản đã có job chờ sẽ được bỏ qua để tránh chạy trùng.
                </p>
                <label className="field mt-5">
                  <span>Phạm vi</span>
                  <select
                    onChange={(event) =>
                      setSyncScope(event.target.value as 'USER' | 'ORGANIZATION' | 'ALL')
                    }
                    value={syncScope}
                  >
                    <option value="USER">Một tài khoản</option>
                    <option value="ORGANIZATION">Cả lớp đang chọn</option>
                    {isSystemAdmin && <option value="ALL">Toàn hệ thống</option>}
                  </select>
                </label>
                {syncScope === 'USER' && (
                  <label className="field mt-4">
                    <span>Tài khoản</span>
                    <select
                      onChange={(event) => setSyncUserId(event.target.value)}
                      value={selectSyncTarget}
                    >
                      {syncEligibleMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name} · {member.codeforces_handle ?? 'chưa có CF'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {syncScope !== 'ALL' && (!isSystemAdmin || syncScope === 'ORGANIZATION') && (
                  <p className="notice pending mt-4">
                    Lớp: <strong>{selectedOrganization?.organization_name}</strong>
                  </p>
                )}
                <button
                  className="button-primary mt-5"
                  disabled={synchronize.isPending || (syncScope === 'USER' && !selectSyncTarget)}
                  type="submit"
                >
                  {synchronize.isPending ? 'Đang xếp hàng…' : 'Bắt đầu đồng bộ'}
                </button>
                {synchronize.error && (
                  <p className="notice error mt-4">{synchronize.error.message}</p>
                )}
                {synchronize.data && (
                  <div className="sync-result mt-4">
                    <strong>{synchronize.data.queued} tài khoản đã vào hàng đợi</strong>
                    <p>
                      Tìm thấy {synchronize.data.matched} · Bỏ qua {synchronize.data.skipped}
                    </p>
                  </div>
                )}
              </form>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <div>
                    <strong>Trạng thái đồng bộ</strong>
                    <span>
                      {isSystemAdmin && syncScope !== 'ORGANIZATION'
                        ? 'Tất cả học sinh, kể cả chưa xếp lớp'
                        : selectedOrganization?.organization_name}
                    </span>
                  </div>
                  <div className="sync-account-filters">
                    <input
                      aria-label="Tìm tài khoản đồng bộ"
                      onChange={(event) => setSyncSearch(event.target.value)}
                      placeholder="Tìm tên, CF, lớp…"
                      type="search"
                      value={syncSearch}
                    />
                    <select
                      aria-label="Lọc trạng thái đồng bộ"
                      onChange={(event) => setSyncStatusFilter(event.target.value)}
                      value={syncStatusFilter}
                    >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="UNLINKED">Chưa liên kết CF</option>
                      <option value="UNVERIFIED">Chưa xác minh</option>
                      <option value="INITIALIZING">Chưa đồng bộ lần đầu</option>
                      <option value="ERROR">Đồng bộ lỗi</option>
                      <option value="QUEUED">Đang chờ</option>
                      <option value="SYNCING">Đang đồng bộ</option>
                      <option value="READY">Đã đồng bộ</option>
                      <option value="INACTIVE">Ngừng hoạt động</option>
                    </select>
                  </div>
                </div>
                {!paginatedSyncAccounts.length && (
                  <EmptyState
                    detail="Thử thay đổi từ khóa hoặc bộ lọc trạng thái."
                    title="Không có tài khoản phù hợp"
                  />
                )}
                {paginatedSyncAccounts.map((member) => (
                  <div className="sync-account-row" key={member.user_id}>
                    <div className="member">
                      <Avatar
                        name={member.display_name}
                        rating={member.current_rating}
                        size="sm"
                        url={member.avatar_url}
                      />
                      <div>
                        <strong>{member.display_name}</strong>
                        <p>@{member.codeforces_handle ?? 'Chưa liên kết Codeforces'}</p>
                        <small>{member.class_label}</small>
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusPill value={member.sync_status ?? 'UNLINKED'} />
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {member.last_sync_at
                          ? `Lần cuối ${formatDate(member.last_sync_at)}`
                          : 'Chưa đồng bộ'}
                      </p>
                    </div>
                  </div>
                ))}
                {filteredSyncAccounts.length > syncPageSize && (
                  <div className="sync-account-pagination">
                    <button
                      className="button-secondary"
                      disabled={visibleSyncPage <= 1}
                      onClick={() => setSyncPage((value) => Math.max(1, value - 1))}
                      type="button"
                    >
                      ← Trước
                    </button>
                    <span>
                      Trang {visibleSyncPage}/{syncPageCount} · {filteredSyncAccounts.length} học
                      sinh
                    </span>
                    <button
                      className="button-secondary"
                      disabled={visibleSyncPage >= syncPageCount}
                      onClick={() => setSyncPage((value) => Math.min(syncPageCount, value + 1))}
                      type="button"
                    >
                      Sau →
                    </button>
                  </div>
                )}
              </div>
              <div className="panel p-6 lg:col-span-2">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">CC LEVEL RECALIBRATION</p>
                    <h2>Khởi tạo / hiệu chỉnh theo bài rated gần nhất</h2>
                    <p>
                      Chỉ đủ điều kiện khi có ít nhất 5 first-solve rated hợp lệ. Hệ thống lấy tối
                      đa 10 bài gần nhất, tính P70 và không giới hạn mức tăng. Chức năng này chỉ
                      chạy khi bạn bấm xác nhận; không tự động thay đổi tài khoản hiện có.
                    </p>
                  </div>
                </div>
                <div className="form-grid mt-5">
                  <label className="field">
                    <span>Phạm vi hiệu chỉnh</span>
                    <select
                      onChange={(event) => {
                        setRecalibrationScope(
                          event.target.value as 'USER' | 'ORGANIZATION' | 'ALL',
                        );
                        recalibrationPreview.reset();
                      }}
                      value={recalibrationScope}
                    >
                      <option value="USER">Một tài khoản</option>
                      <option value="ORGANIZATION">Cả lớp đang chọn</option>
                      {isSystemAdmin && <option value="ALL">Toàn hệ thống</option>}
                    </select>
                  </label>
                  {recalibrationScope === 'USER' && (
                    <label className="field">
                      <span>Tài khoản</span>
                      <select
                        onChange={(event) => {
                          setRecalibrationUserId(event.target.value);
                          recalibrationPreview.reset();
                        }}
                        value={recalibrationUserId || selectSyncTarget}
                      >
                        {syncEligibleMembers.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.display_name} · {member.codeforces_handle}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="field form-span-2">
                    <span>Lý do hiệu chỉnh</span>
                    <textarea
                      minLength={3}
                      onChange={(event) => setRecalibrationReason(event.target.value)}
                      value={recalibrationReason}
                    />
                  </label>
                </div>
                <div className="compact-actions mt-4">
                  <button
                    className="button-secondary"
                    disabled={
                      recalibrationPreview.isPending ||
                      (recalibrationScope === 'USER' && !(recalibrationUserId || selectSyncTarget))
                    }
                    onClick={() => recalibrationPreview.mutate()}
                    type="button"
                  >
                    {recalibrationPreview.isPending ? 'Đang tính…' : 'Xem trước CCL'}
                  </button>
                  <button
                    className="button-primary"
                    disabled={
                      !recalibrationPreview.data?.summary.increases ||
                      applyRecalibration.isPending ||
                      recalibrationReason.trim().length < 3
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Cập nhật ${recalibrationPreview.data?.summary.increases ?? 0} tài khoản có CCL đề xuất cao hơn?`,
                        )
                      )
                        return;
                      applyRecalibration.mutate();
                    }}
                    type="button"
                  >
                    {applyRecalibration.isPending ? 'Đang hiệu chỉnh…' : 'Xác nhận hiệu chỉnh'}
                  </button>
                </div>
                {recalibrationPreview.error && (
                  <p className="notice error mt-4">{recalibrationPreview.error.message}</p>
                )}
                {applyRecalibration.error && (
                  <p className="notice error mt-4">{applyRecalibration.error.message}</p>
                )}
                {applyRecalibration.data && (
                  <p className="notice success mt-4">
                    Đã cập nhật {applyRecalibration.data.updated}/{applyRecalibration.data.total}{' '}
                    tài khoản; bỏ qua {applyRecalibration.data.skipped}.
                  </p>
                )}
                {recalibrationPreview.data && (
                  <div className="cc-level-preview mt-5">
                    <div className="cc-level-preview-summary">
                      <strong>{recalibrationPreview.data.summary.total} tài khoản</strong>
                      <span>{recalibrationPreview.data.summary.increases} sẽ tăng CCL</span>
                      <span>
                        {recalibrationPreview.data.summary.insufficient} chưa đủ 5 bài hợp lệ
                      </span>
                    </div>
                    {recalibrationPreview.data.rows.map((row) => (
                      <div className="cc-level-preview-row" key={row.userId}>
                        <div>
                          <Link to={`/students/${row.userId}`}>{row.displayName}</Link>
                          <small>
                            @{row.codeforcesHandle ?? 'chưa có CF'} · {row.solveCount} bài dùng để
                            tính
                          </small>
                        </div>
                        <span>
                          Hiện tại <strong>{formatNumber(row.currentLevel)}</strong>
                        </span>
                        <span>
                          P70{' '}
                          <strong>
                            {row.percentile70 === null ? 'Chưa đủ dữ liệu' : row.percentile70}
                          </strong>
                        </span>
                        <span className={row.change > 0 ? 'positive' : ''}>
                          Sau hiệu chỉnh <strong>{formatNumber(row.nextLevel)}</strong>
                          {row.change > 0 && <small>+{formatNumber(row.change)}</small>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {tab === 'leaderboard-links' && isSystemAdmin && (
            <section className="space-y-6">
              <form
                className="panel leaderboard-link-generator p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    path: '/admin/leaderboard-links',
                    body: {
                      organizationId: leaderboardScope === 'ALL' ? null : leaderboardOrganizationId,
                    },
                  });
                }}
              >
                <div>
                  <p className="eyebrow">PUBLIC LEADERBOARD</p>
                  <h2 className="mt-2 text-xl font-black">Tạo link xem BXH không cần đăng nhập</h2>
                  <p className="text-sm text-[var(--muted)]">
                    Mỗi phạm vi chỉ có một link đang hoạt động. Tạo link mới sẽ tự thu hồi link cũ.
                  </p>
                </div>
                <label className="field">
                  <span>Phạm vi</span>
                  <select
                    onChange={(event) =>
                      setLeaderboardScope(event.target.value as 'ALL' | 'ORGANIZATION')
                    }
                    value={leaderboardScope}
                  >
                    <option value="ALL">Toàn hệ thống</option>
                    <option value="ORGANIZATION">Một lớp học</option>
                  </select>
                </label>
                {leaderboardScope === 'ORGANIZATION' && (
                  <label className="field">
                    <span>Lớp học</span>
                    <select
                      onChange={(event) => setLeaderboardOrganizationId(event.target.value)}
                      required
                      value={leaderboardOrganizationId}
                    >
                      <option value="">Chọn lớp</option>
                      {organizations.data?.organizations
                        .filter(({ status }) => status === 'ACTIVE')
                        .map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <button className="button-primary" type="submit">
                  Gen link mới
                </button>
              </form>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Link BXH đang hoạt động</strong>
                  <span>Có thể gửi trực tiếp cho phụ huynh và học sinh</span>
                </div>
                {!leaderboardLinks.data?.links.length ? (
                  <EmptyState
                    title="Chưa có link công khai"
                    detail="Hãy tạo link đầu tiên ở phía trên."
                  />
                ) : (
                  leaderboardLinks.data.links.map((link) => {
                    const publicUrl = `${window.location.origin}/leaderboard/${link.public_key}`;
                    return (
                      <div className="admin-row leaderboard-link-row" key={link.id}>
                        <div>
                          <strong>{link.organization_name ?? 'Toàn hệ thống'}</strong>
                          <a href={publicUrl} rel="noreferrer" target="_blank">
                            {publicUrl}
                          </a>
                        </div>
                        <button
                          className="button-secondary"
                          onClick={() => void navigator.clipboard.writeText(publicUrl)}
                          type="button"
                        >
                          Sao chép
                        </button>
                        <button
                          className="button-danger"
                          onClick={() =>
                            mutation.mutate({
                              path: `/admin/leaderboard-links/${link.id}`,
                              method: 'DELETE',
                              body: null,
                            })
                          }
                          type="button"
                        >
                          Thu hồi
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}
          {tab === 'notifications' && isSystemAdmin && (
            <AdminNotificationsPanel
              organizations={organizations.data?.organizations ?? []}
              users={users.data?.users ?? []}
            />
          )}
          {tab === 'audit' && !noOrganizationSelected && (
            <div className="panel audit-panel overflow-hidden">
              <div className="management-header">
                <div>
                  <p className="eyebrow">NHẬT KÝ HỆ THỐNG</p>
                  <strong>Ai đã làm gì, vào lúc nào</strong>
                </div>
                <span>Hiển thị tối đa 50 hoạt động gần nhất</span>
              </div>
              {audits.isPending ? (
                <LoadingState label="Đang tải nhật ký…" />
              ) : audits.error ? (
                <ErrorState error={audits.error} />
              ) : !audits.data?.logs.length ? (
                <EmptyState
                  title="Chưa có hoạt động quản trị"
                  detail="Các thay đổi quan trọng sẽ được ghi chi tiết tại đây."
                />
              ) : (
                audits.data.logs.map((log) => (
                  <div className="audit-row" key={log.id}>
                    <div className="audit-main">
                      <div className="audit-title-line">
                        <strong>
                          {auditActionLabels[log.action] ?? log.action.replaceAll('_', ' ')}
                        </strong>
                        <span>{auditTarget(log)}</span>
                      </div>
                      <p>
                        <b>{log.actor_name ?? 'Hệ thống'}</b> đã thực hiện thao tác này.
                        {log.reason ? ` Lý do: ${log.reason}.` : ''}
                      </p>
                      {auditChanges(log).length > 0 && (
                        <div className="audit-changes">
                          {auditChanges(log).map((change) => (
                            <span key={change}>{change}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="audit-time">
                      <span>Thời gian</span>
                      <strong>{formatDate(log.created_at)}</strong>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'rewards' && isSystemAdmin && (
            <section className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
                <form
                  className="panel p-6"
                  ref={rewardFormRef}
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingReward ? `/admin/rewards/${editingReward.id}` : '/admin/rewards',
                      method: editingReward ? 'PATCH' : 'POST',
                      body: {
                        name: rewardName,
                        description: rewardDescription,
                        cost: Number(rewardCost),
                        stock: rewardStock === '' ? null : Number(rewardStock),
                        active: rewardActive,
                        imageUrl: rewardImageUrl || null,
                        cashValueVnd: rewardCashValue === '' ? null : Number(rewardCashValue),
                        category: rewardCategory,
                        requiredCcLevel: Number(rewardRequiredLevel),
                        requiresApproval: rewardCashValue === '' ? rewardRequiresApproval : false,
                        achievementId:
                          rewardCategory === 'ACHIEVEMENT' ? rewardAchievementId : null,
                      },
                    });
                  }}
                >
                  <p className="eyebrow">CATALOG</p>
                  <div className="section-heading mt-2">
                    <h2 className="m-0 text-xl font-black">
                      {editingReward ? 'Sửa phần thưởng' : 'Tạo phần thưởng'}
                    </h2>
                    {editingReward && (
                      <button
                        className="button-secondary"
                        onClick={() => {
                          setEditingReward(null);
                          setRewardName('');
                          setRewardDescription('');
                          setRewardCost('100');
                          setRewardStock('');
                          setRewardImageUrl('');
                          setRewardCashValue('');
                          setRewardCategory('STANDARD');
                          setRewardRequiredLevel('0');
                          setRewardRequiresApproval(false);
                          setRewardAchievementId('');
                          setRewardActive(true);
                        }}
                        type="button"
                      >
                        Huỷ sửa
                      </button>
                    )}
                  </div>
                  <label className="field mt-5">
                    <span>Tên</span>
                    <input
                      onChange={(e) => setRewardName(e.target.value)}
                      required
                      value={rewardName}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Chi phí CC Balance</span>
                    <input
                      min="1"
                      onChange={(e) => setRewardCost(e.target.value)}
                      required
                      step="1"
                      type="number"
                      value={rewardCost}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Mô tả</span>
                    <textarea
                      onChange={(e) => setRewardDescription(e.target.value)}
                      required
                      value={rewardDescription}
                    />
                  </label>
                  <label className="field mt-4">
                    <span>Giá trị tiền nhận được (VND, trống nếu là quà thường)</span>
                    <input
                      disabled={rewardCategory === 'ACHIEVEMENT'}
                      min="1"
                      onChange={(event) => {
                        setRewardCashValue(event.target.value);
                        if (event.target.value) setRewardRequiresApproval(false);
                      }}
                      placeholder="Ví dụ: 100000"
                      step="1"
                      type="number"
                      value={rewardCashValue}
                    />
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Loại phần thưởng</span>
                      <select
                        onChange={(event) => {
                          const category = event.target.value as
                            'STANDARD' | 'MASCOT' | 'ACHIEVEMENT';
                          setRewardCategory(category);
                          if (category !== 'ACHIEVEMENT') setRewardAchievementId('');
                          if (category === 'ACHIEVEMENT') setRewardCashValue('');
                        }}
                        value={rewardCategory}
                      >
                        <option value="STANDARD">Quà thông thường</option>
                        <option value="MASCOT">Linh vật sưu tầm</option>
                        <option value="ACHIEVEMENT">Danh hiệu</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>CC Level tối thiểu</span>
                      <input
                        min="0"
                        onChange={(event) => setRewardRequiredLevel(event.target.value)}
                        step="1"
                        type="number"
                        value={rewardRequiredLevel}
                      />
                    </label>
                  </div>
                  <label className="approval-toggle mt-4">
                    <input
                      checked={rewardRequiresApproval}
                      disabled={rewardCashValue !== ''}
                      onChange={(event) => setRewardRequiresApproval(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Cần GV/Admin xác nhận</strong>
                      <small>
                        Bỏ chọn để học sinh nhận quà ngay khi đủ CC Balance. Quy đổi tiền mặt luôn
                        được hoàn tất tự động.
                      </small>
                    </span>
                  </label>
                  {rewardCategory === 'ACHIEVEMENT' && (
                    <label className="field mt-4">
                      <span>Danh hiệu được trao khi hoàn tất đổi thưởng</span>
                      <select
                        onChange={(event) => setRewardAchievementId(event.target.value)}
                        required
                        value={rewardAchievementId}
                      >
                        <option value="">Chọn danh hiệu</option>
                        {content.data?.achievements
                          .filter((achievement) => achievement.active)
                          .map((achievement) => (
                            <option key={achievement.id} value={achievement.id}>
                              {achievement.icon} {achievement.name} · Streak{' '}
                              {achievement.required_longest_streak}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Số lượng (trống = không giới hạn)</span>
                      <input
                        min="0"
                        onChange={(e) => setRewardStock(e.target.value)}
                        type="number"
                        value={rewardStock}
                      />
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(e) => setRewardActive(e.target.value === 'ACTIVE')}
                        value={rewardActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang mở</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-4">
                    <RewardImageUploader onChange={setRewardImageUrl} value={rewardImageUrl} />
                  </div>
                  <button className="button-primary mt-5" type="submit">
                    {editingReward ? 'Lưu phần thưởng' : 'Tạo phần thưởng'}
                  </button>
                </form>
                <div className="panel overflow-hidden">
                  {rewards.data?.rewards
                    .filter((reward) => reward.cash_value_vnd === null)
                    .map((reward) => (
                      <div className="admin-row reward-admin-row" key={reward.id}>
                        <div>
                          <strong>{reward.name}</strong>
                          <p className="m-0 text-xs text-[var(--muted)]">
                            {formatNumber(reward.cost, 2)} CC Balance · {reward.stock ?? '∞'} suất
                          </p>
                          {reward.category === 'MASCOT' && (
                            <p className="m-0 text-xs text-[var(--accent)]">
                              Linh vật · cần CC Level {formatNumber(reward.required_cc_level)}
                            </p>
                          )}
                          {reward.category === 'ACHIEVEMENT' && (
                            <p className="m-0 text-xs text-[var(--accent)]">
                              Danh hiệu · {reward.achievement_icon} {reward.achievement_name}
                            </p>
                          )}
                          <p className="m-0 text-xs text-[var(--muted)]">
                            {reward.requires_approval
                              ? 'Cần GV/Admin xác nhận'
                              : 'Tự động nhận ngay'}
                          </p>
                          {reward.cash_value_vnd !== null && (
                            <p className="cash-reward-value">
                              Nhận {formatVnd(reward.cash_value_vnd)}
                            </p>
                          )}
                        </div>
                        <StatusPill value={reward.active ? 'ACTIVE' : 'INACTIVE'} />
                        <div className="student-actions">
                          <button
                            className="button-secondary"
                            onClick={() => beginRewardEdit(reward)}
                            type="button"
                          >
                            Sửa
                          </button>
                          <button
                            className="button-danger"
                            disabled={!reward.active}
                            onClick={() => deleteReward(reward)}
                            type="button"
                          >
                            {reward.active ? (reward.order_count > 0 ? 'Ẩn' : 'Xoá') : 'Đã ẩn'}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <div className="panel cash-exchange-panel overflow-hidden">
                <div className="management-header">
                  <div>
                    <p className="eyebrow">CASH REWARDS</p>
                    <strong>Bảng quy đổi tiền mặt</strong>
                  </div>
                  <span>Sửa từng mức bằng nút Sửa</span>
                </div>
                <div className="cash-exchange-table cash-admin-table cash-exchange-header">
                  <span>CC Balance</span>
                  <span>Tiền nhận</span>
                  <span>Trạng thái</span>
                  <span>Thao tác</span>
                </div>
                {rewards.data?.rewards
                  .filter((reward) => reward.cash_value_vnd !== null)
                  .map((reward) => (
                    <div className="cash-exchange-table cash-admin-table" key={reward.id}>
                      <strong data-label="CC Balance">◈ {formatNumber(reward.cost)}</strong>
                      <strong className="cash-money" data-label="Tiền nhận">
                        {formatVnd(reward.cash_value_vnd)}
                      </strong>
                      <StatusPill value={reward.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => beginRewardEdit(reward)}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          disabled={!reward.active}
                          onClick={() => deleteReward(reward)}
                          type="button"
                        >
                          {reward.active ? (reward.order_count > 0 ? 'Ẩn' : 'Xoá') : 'Đã ẩn'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="panel overflow-hidden">
                <div className="management-header">
                  <strong>Yêu cầu đổi quà & quà tiền</strong>
                  <span>“Đã gửi quà” sẽ cập nhật ngay cho Admin và học sinh</span>
                </div>
                {!rewardOrders.data?.orders.length ? (
                  <EmptyState
                    title="Chưa có yêu cầu đổi quà"
                    detail="Các yêu cầu mới sẽ xuất hiện tại đây."
                  />
                ) : (
                  rewardOrders.data.orders.map((order) => (
                    <div className="admin-row reward-order-admin-row" key={order.id}>
                      <div>
                        <strong>{order.display_name}</strong>
                        <p>
                          {order.reward_name} · {formatNumber(order.cost_snapshot)} CC Balance
                        </p>
                        {order.recipient_name && (
                          <p className="m-0 text-sm font-semibold text-[var(--accent)]">
                            Tặng cho: {order.recipient_name}
                          </p>
                        )}
                        {order.cash_value_vnd !== null && (
                          <p className="cash-reward-value">
                            Quà tiền {formatVnd(order.cash_value_vnd)}
                          </p>
                        )}
                        {!order.requires_approval && (
                          <p className="m-0 text-xs text-[var(--muted)]">Đã hoàn tất tự động</p>
                        )}
                        <small>{formatDate(order.created_at)}</small>
                      </div>
                      <StatusPill value={order.status} />
                      <div className="student-actions">
                        {order.status === 'REQUESTED' && (
                          <>
                            <button
                              className="button-secondary"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/reward-orders/${order.id}/status`,
                                  method: 'PATCH',
                                  body: { status: 'APPROVED', note: 'Admin đã duyệt quà' },
                                })
                              }
                              type="button"
                            >
                              Duyệt
                            </button>
                            <button
                              className="button-danger"
                              onClick={() =>
                                mutation.mutate({
                                  path: `/reward-orders/${order.id}/status`,
                                  method: 'PATCH',
                                  body: { status: 'REJECTED', note: 'Admin từ chối yêu cầu' },
                                })
                              }
                              type="button"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                        {order.status === 'APPROVED' && (
                          <button
                            className="button-primary"
                            onClick={() =>
                              mutation.mutate({
                                path: `/reward-orders/${order.id}/status`,
                                method: 'PATCH',
                                body: { status: 'FULFILLED', note: 'Admin xác nhận đã gửi quà' },
                              })
                            }
                            type="button"
                          >
                            Đã gửi quà
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
          {tab === 'content' && isSystemAdmin && (
            <div className="content-admin-grid">
              <section className="panel p-6">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">DANH NGÔN TRANG CHỦ</p>
                    <h2>Thông điệp truyền cảm hứng</h2>
                  </div>
                  {editingQuote && (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setEditingQuote(null);
                        setQuoteContent('');
                        setQuoteAuthor('');
                        setQuoteOrder('0');
                        setQuoteActive(true);
                      }}
                      type="button"
                    >
                      Huỷ sửa
                    </button>
                  )}
                </div>
                <form
                  className="quote-paste-box"
                  onSubmit={(event) => {
                    event.preventDefault();
                    importPastedQuotes.mutate();
                  }}
                >
                  <label className="field">
                    <span>Dán hàng loạt — mỗi câu một dòng</span>
                    <textarea
                      onChange={(event) => setQuotePaste(event.target.value)}
                      placeholder={
                        'Châm ngôn | Tác giả | Thứ tự | Có\nTrên bước đường thành công không có dấu chân của kẻ lười biếng. | Cầy Cốt MrTee.vn | 1 | Có\nThiên tài 1% là cảm hứng và 99% là mồ hôi. | Cầy Cốt MrTee.vn | 2 | Không'
                      }
                      required
                      rows={7}
                      value={quotePaste}
                    />
                  </label>
                  <button className="button-secondary" disabled={importPastedQuotes.isPending}>
                    {importPastedQuotes.isPending ? 'Đang nhập…' : 'Nhập danh sách đã dán'}
                  </button>
                </form>
                {importPastedQuotes.error && (
                  <p className="notice error">{importPastedQuotes.error.message}</p>
                )}
                {importPastedQuotes.data && (
                  <p className="notice success">
                    Đã nhập {importPastedQuotes.data.created}/{importPastedQuotes.data.total} câu;
                    lỗi {importPastedQuotes.data.failed}.
                  </p>
                )}
                <form
                  className="quote-import-box"
                  onSubmit={(event) => {
                    event.preventDefault();
                    previewQuotes.mutate();
                  }}
                >
                  <div>
                    <strong>Import danh sách danh ngôn</strong>
                    <a download href="/templates/danh-ngon-mau.csv">
                      ⇩ File mẫu CSV
                    </a>
                  </div>
                  <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => setQuoteImportFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                  <button className="button-secondary" disabled={previewQuotes.isPending}>
                    {previewQuotes.isPending ? 'Đang đọc file…' : 'Đọc và xem trước'}
                  </button>
                </form>
                {previewQuotes.error && (
                  <p className="notice error">{previewQuotes.error.message}</p>
                )}
                <EditableImportTable
                  columns={quoteImportColumns}
                  confirmLabel="Xác nhận nhập danh ngôn"
                  onChange={setQuoteImportRows}
                  onConfirm={() => confirmQuotes.mutate()}
                  pending={confirmQuotes.isPending}
                  rows={quoteImportRows}
                />
                {confirmQuotes.error && (
                  <p className="notice error">{confirmQuotes.error.message}</p>
                )}
                {confirmQuotes.data && (
                  <p className="notice success">
                    Đã nhập {confirmQuotes.data.created}/{confirmQuotes.data.total} danh ngôn; lỗi{' '}
                    {confirmQuotes.data.failed}.
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingQuote ? `/admin/quotes/${editingQuote.id}` : '/admin/quotes',
                      method: editingQuote ? 'PATCH' : 'POST',
                      body: {
                        content: quoteContent,
                        author: quoteAuthor || null,
                        sortOrder: Number(quoteOrder),
                        active: quoteActive,
                      },
                    });
                  }}
                >
                  <label className="field">
                    <span>Nội dung</span>
                    <textarea
                      maxLength={1000}
                      onChange={(event) => setQuoteContent(event.target.value)}
                      placeholder="Mỗi bài toán hôm nay là một bước tiến ngày mai…"
                      required
                      value={quoteContent}
                    />
                  </label>
                  <div className="form-grid mt-4">
                    <label className="field">
                      <span>Tác giả / nguồn</span>
                      <input
                        onChange={(event) => setQuoteAuthor(event.target.value)}
                        value={quoteAuthor}
                      />
                    </label>
                    <label className="field">
                      <span>Thứ tự</span>
                      <input
                        min="0"
                        onChange={(event) => setQuoteOrder(event.target.value)}
                        step="1"
                        type="number"
                        value={quoteOrder}
                      />
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(event) => setQuoteActive(event.target.value === 'ACTIVE')}
                        value={quoteActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang hiển thị</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                  </div>
                  <button className="button-primary mt-4" type="submit">
                    {editingQuote ? 'Lưu danh ngôn' : 'Thêm danh ngôn'}
                  </button>
                </form>
                <div className="content-admin-list mt-6">
                  {content.data?.quotes.map((quote) => (
                    <article className="content-admin-item" key={quote.id}>
                      <div>
                        <blockquote>“{quote.content}”</blockquote>
                        <p>
                          {quote.author || 'Không ghi nguồn'} · thứ tự {quote.sort_order} · ♥{' '}
                          {quote.heart_count}
                        </p>
                      </div>
                      <StatusPill value={quote.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingQuote(quote);
                            setQuoteContent(quote.content);
                            setQuoteAuthor(quote.author ?? '');
                            setQuoteOrder(String(quote.sort_order));
                            setQuoteActive(quote.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          onClick={() => {
                            if (!window.confirm('Xoá danh ngôn này?')) return;
                            mutation.mutate({
                              path: `/admin/quotes/${quote.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          Xoá
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel p-6">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">CC LEVEL RANKS</p>
                    <h2>Cấp bậc học sinh</h2>
                  </div>
                  {editingRank && (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setEditingRank(null);
                        setRankMinLevel('800');
                        setRankName('');
                        setRankIcon('🏅');
                        setRankColor('#22d3ee');
                        setRankRewardPoint('0');
                        setRankActive(true);
                      }}
                      type="button"
                    >
                      Huỷ sửa
                    </button>
                  )}
                </div>
                <p className="admin-helper-copy">
                  Hệ thống chọn mốc cao nhất không vượt quá CC Level hiện tại. Mỗi mốc có thể thưởng
                  đồng thời CC Point và CC Balance đúng một lần khi học sinh lần đầu đạt tới. Thay
                  đổi mức thưởng không tự động truy thưởng dữ liệu cũ.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    mutation.mutate({
                      path: editingRank
                        ? `/admin/level-ranks/${editingRank.id}`
                        : '/admin/level-ranks',
                      method: editingRank ? 'PATCH' : 'POST',
                      body: {
                        minLevel: Number(rankMinLevel),
                        name: rankName,
                        icon: rankIcon,
                        color: rankColor,
                        rewardPoint: Number(rankRewardPoint),
                        active: rankActive,
                      },
                    });
                  }}
                >
                  <div className="form-grid">
                    <label className="field">
                      <span>CC Level tối thiểu</span>
                      <input
                        min="0"
                        onChange={(event) => setRankMinLevel(event.target.value)}
                        required
                        step="1"
                        type="number"
                        value={rankMinLevel}
                      />
                    </label>
                    <label className="field">
                      <span>Tên cấp bậc</span>
                      <input
                        onChange={(event) => setRankName(event.target.value)}
                        placeholder="Đồng, Bạc, Vàng…"
                        required
                        value={rankName}
                      />
                    </label>
                    <label className="field">
                      <span>Icon / URL icon</span>
                      <input
                        onChange={(event) => setRankIcon(event.target.value)}
                        required
                        value={rankIcon}
                      />
                    </label>
                    <label className="field">
                      <span>Màu cấp bậc</span>
                      <div className="color-field">
                        <input
                          aria-label="Chọn màu cấp bậc"
                          onChange={(event) => setRankColor(event.target.value)}
                          type="color"
                          value={rankColor}
                        />
                        <input
                          onChange={(event) => setRankColor(event.target.value)}
                          pattern="#[0-9a-fA-F]{6}"
                          value={rankColor}
                        />
                      </div>
                    </label>
                    <label className="field">
                      <span>Trạng thái</span>
                      <select
                        onChange={(event) => setRankActive(event.target.value === 'ACTIVE')}
                        value={rankActive ? 'ACTIVE' : 'INACTIVE'}
                      >
                        <option value="ACTIVE">Đang áp dụng</option>
                        <option value="INACTIVE">Tạm ẩn</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Thưởng lần đầu đạt cấp</span>
                      <input
                        min="0"
                        onChange={(event) => setRankRewardPoint(event.target.value)}
                        step="0.01"
                        type="number"
                        value={rankRewardPoint}
                      />
                      <small>Cùng cộng vào CC Point và CC Balance</small>
                    </label>
                  </div>
                  <button className="button-primary mt-4" type="submit">
                    {editingRank ? 'Lưu cấp bậc' : 'Thêm cấp bậc'}
                  </button>
                </form>
                <div className="rank-admin-list mt-6">
                  {content.data?.ranks.map((rank) => (
                    <article className="rank-admin-item" key={rank.id}>
                      <LevelRankIcon icon={rank.icon} name={rank.name} />
                      <div>
                        <strong style={{ color: rank.color }}>{rank.name}</strong>
                        <p>
                          Từ CC Level {formatNumber(rank.min_level)} · thưởng{' '}
                          {formatNumber(rank.reward_point, 2)} CCP + CCB lần đầu
                        </p>
                      </div>
                      <StatusPill value={rank.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingRank(rank);
                            setRankMinLevel(String(rank.min_level));
                            setRankName(rank.name);
                            setRankIcon(rank.icon);
                            setRankColor(rank.color);
                            setRankRewardPoint(rank.reward_point ?? '0');
                            setRankActive(rank.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          onClick={() => {
                            if (!window.confirm(`Xoá cấp bậc “${rank.name}”?`)) return;
                            mutation.mutate({
                              path: `/admin/level-ranks/${rank.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          Xoá
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="panel p-6 content-admin-wide">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">STREAK ACHIEVEMENTS</p>
                    <h2>Quản lý danh hiệu</h2>
                    <p>
                      Danh hiệu tự mở khóa theo Streak dài nhất; Admin cũng có thể tặng trực tiếp
                      hoặc liên kết danh hiệu ở phần Đổi thưởng.
                    </p>
                  </div>
                  {editingAchievement && (
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setEditingAchievement(null);
                        setAchievementName('');
                        setAchievementDescription('');
                        setAchievementIcon('🏅');
                        setAchievementTier('BRONZE');
                        setAchievementColor('#b7791f');
                        setAchievementStreak('3');
                        setAchievementActive(true);
                      }}
                      type="button"
                    >
                      Huỷ sửa
                    </button>
                  )}
                </div>
                <div className="achievement-admin-layout mt-5">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutation.mutate({
                        path: editingAchievement
                          ? `/admin/achievements/${editingAchievement.id}`
                          : '/admin/achievements',
                        method: editingAchievement ? 'PATCH' : 'POST',
                        body: {
                          name: achievementName,
                          description: achievementDescription,
                          icon: achievementIcon,
                          tier: achievementTier,
                          color: achievementColor,
                          requiredLongestStreak: Number(achievementStreak),
                          active: achievementActive,
                        },
                      });
                    }}
                  >
                    <div className="form-grid">
                      <label className="field">
                        <span>Tên danh hiệu</span>
                        <input
                          onChange={(event) => setAchievementName(event.target.value)}
                          required
                          value={achievementName}
                        />
                      </label>
                      <label className="field">
                        <span>Mốc Streak dài nhất</span>
                        <input
                          min="1"
                          onChange={(event) => setAchievementStreak(event.target.value)}
                          required
                          step="1"
                          type="number"
                          value={achievementStreak}
                        />
                      </label>
                      <label className="field">
                        <span>Cấp bậc</span>
                        <select
                          onChange={(event) =>
                            setAchievementTier(event.target.value as Achievement['tier'])
                          }
                          value={achievementTier}
                        >
                          {Object.entries(achievementTierLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Icon / URL icon</span>
                        <input
                          onChange={(event) => setAchievementIcon(event.target.value)}
                          required
                          value={achievementIcon}
                        />
                      </label>
                      <label className="field">
                        <span>Màu cấp bậc</span>
                        <div className="color-field">
                          <input
                            aria-label="Chọn màu danh hiệu"
                            onChange={(event) => setAchievementColor(event.target.value)}
                            type="color"
                            value={achievementColor}
                          />
                          <input
                            onChange={(event) => setAchievementColor(event.target.value)}
                            pattern="#[0-9a-fA-F]{6}"
                            value={achievementColor}
                          />
                        </div>
                      </label>
                      <label className="field">
                        <span>Trạng thái</span>
                        <select
                          onChange={(event) =>
                            setAchievementActive(event.target.value === 'ACTIVE')
                          }
                          value={achievementActive ? 'ACTIVE' : 'INACTIVE'}
                        >
                          <option value="ACTIVE">Đang áp dụng</option>
                          <option value="INACTIVE">Tạm ẩn</option>
                        </select>
                      </label>
                      <label className="field form-span-2">
                        <span>Mô tả</span>
                        <textarea
                          onChange={(event) => setAchievementDescription(event.target.value)}
                          required
                          value={achievementDescription}
                        />
                      </label>
                    </div>
                    <button className="button-primary mt-4" type="submit">
                      {editingAchievement ? 'Lưu danh hiệu' : 'Thêm danh hiệu'}
                    </button>
                  </form>
                  <form
                    className="achievement-gift-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      mutation.mutate({
                        path: `/admin/achievements/${giftAchievementId}/grant`,
                        body: {
                          userId: giftAchievementUserId,
                          note: giftAchievementNote,
                        },
                      });
                    }}
                  >
                    <p className="eyebrow">TẶNG DANH HIỆU</p>
                    <label className="field">
                      <span>Danh hiệu</span>
                      <select
                        onChange={(event) => setGiftAchievementId(event.target.value)}
                        required
                        value={giftAchievementId}
                      >
                        <option value="">Chọn danh hiệu</option>
                        {content.data?.achievements.map((achievement) => (
                          <option key={achievement.id} value={achievement.id}>
                            {achievement.icon} {achievement.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Học sinh nhận</span>
                      <select
                        onChange={(event) => setGiftAchievementUserId(event.target.value)}
                        required
                        value={giftAchievementUserId}
                      >
                        <option value="">Chọn học sinh</option>
                        {users.data?.users
                          .filter((user) => user.status === 'ACTIVE')
                          .map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.display_name} · {user.email}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Lý do</span>
                      <textarea
                        onChange={(event) => setGiftAchievementNote(event.target.value)}
                        required
                        value={giftAchievementNote}
                      />
                    </label>
                    <button className="button-secondary" type="submit">
                      Tặng danh hiệu
                    </button>
                  </form>
                </div>
                <div className="rank-admin-list mt-6">
                  {content.data?.achievements.map((achievement) => (
                    <article className="rank-admin-item" key={achievement.id}>
                      <LevelRankIcon icon={achievement.icon} name={achievement.name} />
                      <div>
                        <strong style={{ color: achievement.color }}>{achievement.name}</strong>
                        <p>
                          {achievementTierLabels[achievement.tier]} · Streak{' '}
                          {achievement.required_longest_streak} ngày · đã tặng{' '}
                          {achievement.granted_count}
                        </p>
                      </div>
                      <StatusPill value={achievement.active ? 'ACTIVE' : 'INACTIVE'} />
                      <div className="student-actions">
                        <button
                          className="button-secondary"
                          onClick={() => {
                            setEditingAchievement(achievement);
                            setAchievementName(achievement.name);
                            setAchievementDescription(achievement.description);
                            setAchievementIcon(achievement.icon);
                            setAchievementTier(achievement.tier);
                            setAchievementColor(achievement.color);
                            setAchievementStreak(String(achievement.required_longest_streak));
                            setAchievementActive(achievement.active);
                          }}
                          type="button"
                        >
                          Sửa
                        </button>
                        <button
                          className="button-danger"
                          disabled={!achievement.active}
                          onClick={() => {
                            if (!window.confirm(`Ẩn danh hiệu “${achievement.name}”?`)) return;
                            mutation.mutate({
                              path: `/admin/achievements/${achievement.id}`,
                              method: 'DELETE',
                              body: null,
                            });
                          }}
                          type="button"
                        >
                          {achievement.active ? 'Ẩn' : 'Đã ẩn'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </>
  );
}

function LevelRankIcon({ icon, name }: { icon: string; name: string }) {
  const isImage = /^https?:\/\//i.test(icon) || icon.startsWith('/');
  return (
    <span className="level-rank-icon" aria-label={`Cấp bậc ${name}`}>
      {isImage ? <img alt="" src={icon} /> : icon}
    </span>
  );
}
