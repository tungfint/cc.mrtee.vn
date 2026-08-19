export interface EditableImportRow {
  row: number;
  errors?: string[];
  [key: string]: unknown;
}

interface ImportColumn {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number' | 'checkbox' | 'select';
  options?: { value: string; label: string }[];
  width?: string;
}

function inputValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function EditableImportTable<T extends EditableImportRow>({
  rows,
  columns,
  onChange,
  onConfirm,
  pending,
  confirmLabel = 'Xác nhận import',
}: {
  rows: T[];
  columns: ImportColumn[];
  onChange: (rows: T[]) => void;
  onConfirm: () => void;
  pending: boolean;
  confirmLabel?: string;
}) {
  if (!rows.length) return null;
  const update = (index: number, key: string, value: unknown) => {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value, errors: [] } : row,
      ),
    );
  };
  return (
    <div className="import-preview">
      <div className="import-preview-heading">
        <div>
          <strong>Xem trước và chỉnh sửa dữ liệu</strong>
          <span>{rows.length} dòng · kiểm tra kỹ trước khi xác nhận</span>
        </div>
        <button className="button-primary" disabled={pending} onClick={onConfirm} type="button">
          {pending ? 'Đang xử lý…' : confirmLabel}
        </button>
      </div>
      <div className="import-preview-scroll">
        <table>
          <thead>
            <tr>
              <th>Dòng</th>
              {columns.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }}>
                  {column.label}
                </th>
              ))}
              <th>Kiểm tra</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className={row.errors?.length ? 'has-error' : ''} key={`${row.row}-${index}`}>
                <td>{row.row}</td>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.type === 'checkbox' ? (
                      <input
                        checked={Boolean(row[column.key])}
                        onChange={(event) => update(index, column.key, event.target.checked)}
                        type="checkbox"
                      />
                    ) : column.type === 'select' ? (
                      <select
                        onChange={(event) => update(index, column.key, event.target.value)}
                        value={inputValue(row[column.key])}
                      >
                        {column.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        onChange={(event) =>
                          update(
                            index,
                            column.key,
                            column.type === 'number'
                              ? Number(event.target.value)
                              : event.target.value,
                          )
                        }
                        type={column.type ?? 'text'}
                        value={inputValue(row[column.key])}
                      />
                    )}
                  </td>
                ))}
                <td className="import-row-status">
                  {row.errors?.length ? row.errors.join('; ') : 'Sẵn sàng'}
                </td>
                <td>
                  <button
                    aria-label={`Bỏ dòng ${row.row}`}
                    className="button-danger import-remove-row"
                    onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                    type="button"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
