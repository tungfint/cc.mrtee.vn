import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RewardImageUploader } from './reward-image-uploader';

describe('RewardImageUploader', () => {
  it('opens the current reward image in the crop editor without selecting another file', () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RewardImageUploader onChange={vi.fn()} value="/mascots/cu-cay-cot.webp" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh ảnh hiện tại' }));

    expect(screen.getByLabelText('Xem trước vùng cắt ảnh phần thưởng')).toBeInTheDocument();
    expect(screen.getByText('Thu nhỏ / phóng to')).toBeInTheDocument();
  });
});
