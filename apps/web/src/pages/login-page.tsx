import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type SessionUser } from '../lib/api';
import { PasswordInput } from '../components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useMutation({
    mutationFn: () =>
      api<{ user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      void navigate(
        user.mustChangePassword
          ? '/account?password=required'
          : ((location.state as { from?: string } | null)?.from ?? '/'),
        { replace: true },
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand text-white">
          <img alt="" className="brand-logo" src="/brand/cay-code-logo.webp" />
          <span>
            <strong>Cầy Cốt</strong>
            <small>MrTee.VN</small>
          </span>
        </div>
        <div className="max-w-xl">
          <p className="eyebrow text-cyan-300!">PRACTICE · PROGRESS · PROVE IT</p>
          <h1 className="mt-4 text-5xl font-black leading-[1.02] tracking-[-0.05em] text-white md:text-7xl">
            Bền bỉ mỗi ngày, mạnh mẽ hơn qua từng bài toán.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
            Cầy Cốt biến hành trình luyện Codeforces thành những cột mốc rõ ràng: năng lực tiến bộ,
            thói quen được ghi nhận và nỗ lực luôn có phần thưởng xứng đáng.
          </p>
        </div>
        <p className="text-xs text-slate-500">Cầy Cốt MrTee.vn · Codeforces Tracker v2</p>
      </section>
      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Đăng nhập</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Tiếp tục hành trình luyện tập của bạn.</p>
          <label className="field mt-8">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field mt-4">
            <span>Mật khẩu</span>
            <PasswordInput
              autoComplete="current-password"
              minLength={12}
              onChange={(e) => setPassword(e.target.value)}
              required
              value={password}
            />
          </label>
          {login.error && <p className="form-error">{login.error.message}</p>}
          <button className="button-primary mt-6 w-full" disabled={login.isPending} type="submit">
            {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập →'}
          </button>
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Tài khoản được cấp bởi quản trị viên lớp học.
          </p>
        </form>
      </section>
    </main>
  );
}
