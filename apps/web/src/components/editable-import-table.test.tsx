import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableImportTable } from './editable-import-table';

describe('EditableImportTable', () => {
  it('shows parsed rows and sends edits back before confirmation', () => {
    const onChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <EditableImportTable
        columns={[
          { key: 'email', label: 'Tài khoản' },
          {
            key: 'operation',
            label: 'Thao tác',
            type: 'select',
            options: [
              { value: 'CỘNG', label: 'CỘNG' },
              { value: 'TRỪ', label: 'TRỪ' },
            ],
          },
        ]}
        onChange={onChange}
        onConfirm={onConfirm}
        pending={false}
        rows={[{ row: 2, email: 'student@example.com', operation: 'CỘNG', errors: [] }]}
      />,
    );

    expect(screen.getByText('Xem trước và chỉnh sửa dữ liệu')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('student@example.com'), {
      target: { value: 'edited@example.com' },
    });
    expect(onChange).toHaveBeenCalledWith([
      { row: 2, email: 'edited@example.com', operation: 'CỘNG', errors: [] },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận import' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
