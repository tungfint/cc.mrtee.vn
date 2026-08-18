import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { LoadingState } from './components/ui';
import { useSession } from './lib/api';

const LoginPage = lazy(() => import('./pages/login-page'));
const DashboardPage = lazy(() => import('./pages/dashboard-page'));
const LeaderboardPage = lazy(() => import('./pages/leaderboard-page'));
const RewardsPage = lazy(() => import('./pages/rewards-page'));
const OrdersPage = lazy(() => import('./pages/orders-page'));
const AdminPage = lazy(() => import('./pages/admin-page'));
const AccountPage = lazy(() => import('./pages/account-page'));
const AboutPage = lazy(() => import('./pages/about-page'));

function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingState label="Đang kiểm tra phiên đăng nhập…" fullPage />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell user={session.data.user} />;
}

export function App() {
  return (
    <Suspense fallback={<LoadingState label="Đang tải giao diện…" fullPage />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<DashboardPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="rewards" element={<RewardsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
