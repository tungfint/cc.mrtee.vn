import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export function RewardImageUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    if (!sourceUrl) return;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const scale =
        Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const travelX = Math.max(0, width - canvas.width) / 2;
      const travelY = Math.max(0, height - canvas.height) / 2;
      const x = (canvas.width - width) / 2 + (offsetX / 100) * travelX;
      const y = (canvas.height - height) / 2 + (offsetY / 100) * travelY;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, x, y, width, height);
    };
    image.src = sourceUrl;
  }, [offsetX, offsetY, sourceUrl, zoom]);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );

  const upload = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Chưa có ảnh để tải lên');
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Không thể xử lý ảnh'))),
          'image/jpeg',
          0.92,
        );
      });
      const form = new FormData();
      form.append('image', blob, 'reward.jpg');
      return api<{ imageUrl: string }>('/admin/rewards/image', { method: 'POST', body: form });
    },
    onSuccess: ({ imageUrl }) => {
      onChange(imageUrl);
      setSourceUrl('');
    },
  });

  return (
    <div className="reward-image-uploader">
      <div className="reward-image-heading">
        <div className="reward-image-preview">
          {value ? <img alt="Ảnh phần thưởng hiện tại" src={value} /> : <span>🎁</span>}
        </div>
        <div>
          <strong>Ảnh phần thưởng</strong>
          <p>Tỷ lệ chuẩn 3:2 · xuất ảnh 1200 × 800 px · tối đa 8 MB</p>
          <label className="button-secondary avatar-file-button">
            Chọn ảnh để tải lên
            <input
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (sourceUrl) URL.revokeObjectURL(sourceUrl);
                setSourceUrl(URL.createObjectURL(file));
                setZoom(1);
                setOffsetX(0);
                setOffsetY(0);
              }}
              type="file"
            />
          </label>
        </div>
      </div>
      {sourceUrl && (
        <div className="reward-crop-workspace">
          <canvas
            aria-label="Xem trước vùng cắt ảnh phần thưởng"
            height="800"
            ref={canvasRef}
            width="1200"
          />
          <div className="avatar-crop-controls">
            <label>
              <span>Phóng to</span>
              <input
                max="3"
                min="1"
                onChange={(event) => setZoom(Number(event.target.value))}
                step="0.05"
                type="range"
                value={zoom}
              />
            </label>
            <label>
              <span>Dịch ngang</span>
              <input
                max="100"
                min="-100"
                onChange={(event) => setOffsetX(Number(event.target.value))}
                type="range"
                value={offsetX}
              />
            </label>
            <label>
              <span>Dịch dọc</span>
              <input
                max="100"
                min="-100"
                onChange={(event) => setOffsetY(Number(event.target.value))}
                type="range"
                value={offsetY}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="button-primary"
                disabled={upload.isPending}
                onClick={() => upload.mutate()}
                type="button"
              >
                {upload.isPending ? 'Đang tải…' : 'Cắt & tải ảnh'}
              </button>
              <button className="button-secondary" onClick={() => setSourceUrl('')} type="button">
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
      <label className="field mt-4">
        <span>Hoặc dùng URL hình ảnh</span>
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          type="url"
          value={value}
        />
      </label>
      {value && !sourceUrl && (
        <button className="button-secondary mt-3" onClick={() => onChange('')} type="button">
          Xoá ảnh đã chọn
        </button>
      )}
      {upload.error && <p className="notice error mt-3">{upload.error.message}</p>}
    </div>
  );
}
