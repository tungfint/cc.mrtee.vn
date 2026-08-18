import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, type SessionUser } from '../lib/api';
import { Avatar } from './ui';

const links = [
  { to: '/', label: 'Tổng quan', icon: '◫', end: true },
  { to: '/leaderboard', label: 'Xếp hạng', icon: '↗' },
  { to: '/rewards', label: 'Đổi thưởng', icon: '◇' },
  { to: '/orders', label: 'Quà của tôi', icon: '≡' },
  { to: '/recognition', label: 'Vinh danh', icon: '✦' },
  { to: '/about', label: 'Giới thiệu', icon: '?' },
  { to: '/account', label: 'Tài khoản', icon: '●' },
];

export function AppShell({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api<{
        user: {
          display_name: string;
          avatar_url: string | null;
          current_rating: number | null;
        };
        memberships: { role: string }[];
      }>('/me'),
  });
  const canAdmin =
    user.systemRole === 'SYSTEM_ADMIN' ||
    profile.data?.memberships.some(({ role }) => ['TEACHER', 'ORG_ADMIN'].includes(role));
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/login');
    },
  });
  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('cc-theme', next);
  };

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <img alt="" className="brand-logo" src="/brand/cay-code-logo.webp" />
          <span>
            <strong>Cầy Code</strong>
            <small>MrTee.vn</small>
          </span>
        </NavLink>
        <nav className="nav-list" aria-label="Điều hướng chính">
          {links.map((link) => (
            <NavLink
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end={link.end === true}
              key={link.to}
              to={link.to}
            >
              <span aria-hidden>{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
          {canAdmin && (
            <NavLink
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to="/admin"
            >
              <span>⌘</span>Quản trị
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <button className="icon-button" onClick={toggleTheme} title="Đổi giao diện" type="button">
            ◐
          </button>
          <Avatar
            name={profile.data?.user.display_name ?? user.displayName}
            rating={profile.data?.user.current_rating}
            size="sm"
            url={profile.data?.user.avatar_url}
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-bold">{user.displayName}</p>
            <p className="m-0 text-[11px] text-[var(--muted)]">
              {user.systemRole === 'SYSTEM_ADMIN' ? 'System admin' : 'Học sinh'}
            </p>
          </div>
          <button
            className="icon-button"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            title="Đăng xuất"
            type="button"
          >
            ↪
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
