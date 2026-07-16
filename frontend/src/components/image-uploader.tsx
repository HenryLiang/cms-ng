'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { uploadMedia, type MediaAsset } from '@/lib/media-api';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB，与后端默认一致

interface ImageUploaderProps {
  onUploaded?: (assets: MediaAsset[]) => void;
  /** 是否允许多选，默认 true */
  multiple?: boolean;
  className?: string;
}

/**
 * 通用图片上传组件：拖拽 + 点击 + 粘贴。
 * 类型/大小前端预校验（给出即时提示），最终由后端 magic number 校验把关。
 */
export function ImageUploader({
  onUploaded,
  multiple = true,
  className,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const badType = files.find((f) => !ACCEPTED_MIME.includes(f.type));
      if (badType) {
        setError(`不支持的文件类型：${badType.name}（仅 jpg/png/webp/gif）`);
        return;
      }
      const tooBig = files.find((f) => f.size > MAX_BYTES);
      if (tooBig) {
        setError(`文件过大：${tooBig.name}（上限 10MB）`);
        return;
      }

      setError(null);
      setUploading(true);
      try {
        const assets = await uploadMedia(files);
        onUploaded?.(assets);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? '上传失败，请重试';
        setError(msg);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUploaded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (uploading) return;
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles, uploading],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (uploading) return;
      const files = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length > 0) {
        e.preventDefault();
        void handleFiles(files);
      }
    },
    [handleFiles, uploading],
  );

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading)
            inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        ) : (
          <UploadCloud className="h-8 w-8 text-zinc-400" />
        )}
        <div className="text-sm font-medium text-zinc-700">
          {uploading ? '上传中…' : '点击、拖拽或粘贴图片到此处'}
        </div>
        <div className="text-xs text-zinc-400">
          支持 jpg/png/webp/gif，单文件 ≤ 10MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME.join(',')}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
          }}
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
