'use client';

import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, type ToastType } from '@/store/toast-store';

const ICON_MAP: Record<ToastType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLE_MAP: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-zinc-200 bg-white text-zinc-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="通知"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = ICON_MAP[t.type];
        return (
          <div
            key={t.id}
            role="status"
            data-testid={`toast-${t.type}`}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-sm ${STYLE_MAP[t.type]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm leading-relaxed">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="关闭通知"
              className="shrink-0 rounded p-0.5 text-current opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
