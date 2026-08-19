import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import StudentProfilePage from './student-profile-page';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: vi.fn() };
});

describe('StudentProfilePage', () => {
  beforeEach(() => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path === '/auth/session') {
        return Promise.resolve({
          user: {
            userId: '11111111-1111-4111-8111-111111111111',
            displayName: 'Minh',
            systemRole: 'USER',
            mustChangePassword: false,
          },
        });
      }
      return Promise.resolve({
        profile: {
          id: '11111111-1111-4111-8111-111111111111',
          full_name: 'Nguyễn Minh',
          display_name: 'Minh',
          avatar_url: null,
          codeforces_handle: 'minh_cf',
          current_rating: 1200,
          max_rating: 1300,
          codeforces_rank: 'pupil',
          codeforces_max_rank: 'pupil',
          cc_base: '800',
          cc_level: '1100',
          cc_point: '120',
          cc_balance: '90',
          cash_received_vnd: '0',
          total_solves: 20,
          solves_last_30_days: 8,
          highest_problem_rating: 1200,
          highest_problem_name: 'Watermelon',
          classes: ['Lớp A'],
          level_rank_name: 'Bạc',
          level_rank_icon: '🥈',
          level_rank_color: '#ec4899',
        },
        streak: {
          current_streak: 2,
          longest_streak: 7,
          pending_bonus: 1,
          settled_bonus: 7,
          timeline: [
            {
              date: '2026-08-19',
              kind: 'SOLVE',
              problemName: 'Watermelon',
              problemRating: 800,
              submissionId: '123',
              codeforcesUrl: 'https://codeforces.com/contest/4/submission/123',
              mascotName: null,
              mascotImageUrl: null,
            },
          ],
          rescue: {
            missingDates: ['2026-08-18'],
            requiredMascots: 1,
            available: true,
            maxDays: 3,
            mascots: [
              {
                order_id: '22222222-2222-4222-8222-222222222222',
                reward_id: '33333333-3333-4333-8333-333333333333',
                name: 'Mèo Mầm Code',
                image_url: '/mascots/meo-mam-code.webp',
                acquired_at: '2026-08-01T00:00:00Z',
              },
            ],
          },
          bonus_milestones: [{ days: 7, ccPoint: 7 }],
        },
        awards: [],
        rewards: [],
        topTags: [],
      });
    });
  });

  it('shows the daily Codeforces proof, bonus conversion and rescue inventory', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['session'], {
      user: {
        userId: '11111111-1111-4111-8111-111111111111',
        displayName: 'Minh',
        systemRole: 'USER',
        mustChangePassword: false,
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/students/11111111-1111-4111-8111-111111111111']}>
          <Routes>
            <Route path="/students/:userId" element={<StudentProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Bài đầu tiên được ghi nhận mỗi ngày' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở Codeforces ↗' })).toHaveAttribute(
      'href',
      'https://codeforces.com/contest/4/submission/123',
    );
    expect(screen.getByText('7 ngày')).toBeInTheDocument();
    expect(await screen.findByText('Mèo Mầm Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hi sinh 1 linh vật' })).toBeDisabled();
  });
});
