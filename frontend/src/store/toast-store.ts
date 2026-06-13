import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // ms; 0 = sticky
}

interface ToastStore {
  toasts: Toast[];
  show: (input: { message: string; type?: ToastType; duration?: number }) => string;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;

let nextId = 0;
const genId = () => `toast-${Date.now()}-${++nextId}`;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: ({ message, type = 'info', duration = DEFAULT_DURATION }) => {
    const id = genId();
    const toast: Toast = { id, type, message, duration };

    set((state) => {
      // Cap at MAX_VISIBLE — drop the oldest if we'd exceed
      const next = [...state.toasts, toast];
      if (next.length > MAX_VISIBLE) {
        next.splice(0, next.length - MAX_VISIBLE);
      }
      return { toasts: next };
    });

    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }

    return id;
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
