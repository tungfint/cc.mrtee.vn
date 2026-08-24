import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import RewardsPage from './rewards-page';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: vi.fn() };
});

describe('RewardsPage', () => {
  beforeEach(() => {
    const catalog = {
      walletBalance: '600.00',
      rewards: [
        {
          id: 'mascot',
          name: 'Mèo Mầm Code',
          description: 'Linh vật khởi đầu',
          cost: '30.00',
          stock: null,
          image_url: '/mascots/meo-mam-code.webp',
          cash_value_vnd: null,
          category: 'MASCOT',
          required_cc_level: 800,
          achievement_id: null,
          achievement_name: null,
          achievement_icon: null,
          achievement_tier: null,
          achievement_color: null,
          owned_quantity: 2,
          requires_approval: false,
        },
        {
          id: 'title',
          name: 'Ngọn lửa kiên trì',
          description: 'Danh hiệu Streak 7 ngày',
          cost: '70.00',
          stock: null,
          image_url: null,
          cash_value_vnd: null,
          category: 'ACHIEVEMENT',
          required_cc_level: 0,
          achievement_id: '11111111-1111-4111-8111-111111111111',
          achievement_name: 'Ngọn lửa kiên trì',
          achievement_icon: '🔥',
          achievement_tier: 'SILVER',
          achievement_color: '#64748b',
          owned_quantity: 0,
          requires_approval: false,
        },
        {
          id: 'cash',
          name: 'Quà tiền 10.000đ',
          description: 'Quy đổi tiền mặt',
          cost: '120.00',
          stock: null,
          image_url: null,
          cash_value_vnd: 10_000,
          category: 'STANDARD',
          required_cc_level: 0,
          achievement_id: null,
          achievement_name: null,
          achievement_icon: null,
          achievement_tier: null,
          achievement_color: null,
          owned_quantity: 0,
          requires_approval: false,
        },
      ],
    };
    vi.mocked(api).mockImplementation((path) => {
      if (path === '/rewards/gift-recipients') {
        return Promise.resolve({
          users: [
            {
              id: '11111111-1111-4111-8111-111111111112',
              display_name: 'Bạn học Demo',
              avatar_url: null,
              codeforces_handle: 'demo_friend',
              current_rating: 1200,
            },
          ],
        });
      }
      return Promise.resolve(catalog);
    });
  });

  it('places the compact cash table beside the mascot catalog', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RewardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Đồng đội đáng yêu của dân Cầy Cốt' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CC Balance thành tiền' })).toBeInTheDocument();
    expect(screen.getAllByText('Mèo Mầm Code').length).toBeGreaterThan(0);
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Dấu ấn cho hành trình bền bỉ' }),
    ).toBeInTheDocument();
    expect(screen.getByText('DANH HIỆU · Bạc')).toBeInTheDocument();
    expect(screen.getByText('⚡ CC Level 800')).toBeInTheDocument();
    expect(screen.getByText(/10\.000/)).toBeInTheDocument();
    expect(screen.getAllByText(/600 CC Balance/)).toHaveLength(1);
    expect(screen.getByText(/không cần chờ Admin duyệt/i)).toBeInTheDocument();
  });

  it('opens a gift dialog with recipient and message fields', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RewardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findAllByText('Mèo Mầm Code');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tặng bạn bè' })[0]!);

    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Tặng “Mèo Mầm Code” cho bạn bè',
    );
    expect(screen.getByLabelText('Người nhận')).toBeInTheDocument();
    expect(screen.getByLabelText('Lời nhắn (không bắt buộc)')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Bạn học Demo/ })).toBeInTheDocument();
  });

  it('opens a dedicated confirmation dialog before redeeming', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RewardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findAllByText('Mèo Mầm Code');
    fireEvent.click(screen.getAllByRole('button', { name: 'Đổi ngay' })[0]!);

    expect(
      await screen.findByRole('dialog', { name: 'Đổi “Mèo Mầm Code”?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('CC Balance sẽ dùng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đổi' })).toBeInTheDocument();
  });
});
