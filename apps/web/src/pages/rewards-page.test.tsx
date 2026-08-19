import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import RewardsPage from './rewards-page';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: vi.fn() };
});

describe('RewardsPage', () => {
  beforeEach(() => {
    vi.mocked(api).mockResolvedValue({
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
        },
      ],
    });
  });

  it('places the compact cash table beside the mascot catalog', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RewardsPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Đồng đội đáng yêu của dân Cầy Code' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CC Balance thành tiền' })).toBeInTheDocument();
    expect(screen.getByText('Mèo Mầm Code')).toBeInTheDocument();
    expect(screen.getByText('⚡ CC Level 800')).toBeInTheDocument();
    expect(screen.getByText(/10\.000/)).toBeInTheDocument();
  });
});
