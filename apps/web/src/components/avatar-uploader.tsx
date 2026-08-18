import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Avatar } from './ui';

export function AvatarUploader({ name, currentUrl }: { name: string; currentUrl: string | null }) {
  const queryClient = useQueryClient();
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
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const size = canvas.width;
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const travelX = Math.max(0, width - size) / 2;
      const travelY = Math.max(0, height - size) / 2;
      const x = (size - width) / 2 + (offsetX / 100) * travelX;
      const y = (size - height) / 2 + (offsetY / 100) * travelY;
      context.clearRect(0, 0, size, size);
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

  const invalidateProfile = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['session'] }),
    ]);
  };
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
      form.append('avatar', blob, 'avatar.jpg');
      return api<{ avatarUrl: string }>('/me/avatar', { method: 'POST', body: form });
    },
    onSuccess: async () => {
      setSourceUrl('');
      await invalidateProfile();
    },
  });
  const remove = useMutation({
    mutationFn: () => api('/me/avatar', { method: 'DELETE' }),
    onSuccess: invalidateProfile,
  });

  return (
    <section className="avatar-upload-panel">
      <div className="avatar-upload-heading">
        <Avatar name={name} size="xl" url={currentUrl} />
        <div>
          <strong>Ảnh đại diện</strong>
          <p>JPG, PNG hoặc WebP · tối đa 5 MB</p>
          <label className="button-secondary avatar-file-button">
            Chọn ảnh
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
        <div className="avatar-crop-workspace">
          <canvas aria-label="Xem trước vùng cắt avatar" height="512" ref={canvasRef} width="512" />
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
                {upload.isPending ? 'Đang tải…' : 'Cắt & lưu ảnh'}
              </button>
              <button className="button-secondary" onClick={() => setSourceUrl('')} type="button">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
      {currentUrl && !sourceUrl && (
        <button
          className="button-secondary mt-3"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
          type="button"
        >
          Xóa ảnh hiện tại
        </button>
      )}
      {(upload.error || remove.error) && (
        <p className="notice error mt-3">{(upload.error ?? remove.error)?.message}</p>
      )}
      {(upload.isSuccess || remove.isSuccess) && (
        <p className="notice success mt-3">Đã cập nhật ảnh đại diện.</p>
      )}
    </section>
  );
}
