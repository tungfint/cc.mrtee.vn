import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('renders the Vietnamese login experience', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Cầy Cốt')).toBeInTheDocument();
    expect(screen.getByText('MrTee.VN')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản được cấp bởi quản trị viên lớp học.')).toBeInTheDocument();
  });
});
