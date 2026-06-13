import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useToastStore } from '@/store/toast-store';
import ToastHost from './toast-host';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('ToastHost', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastHost />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a toast with its message and the right style for type=error', () => {
    act(() => {
      useToastStore.getState().show({ message: '保存失败', type: 'error' });
    });
    render(<ToastHost />);
    expect(screen.getByText('保存失败')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    act(() => {
      useToastStore.getState().show({ message: '第一条' });
      useToastStore.getState().show({ message: '第二条', type: 'success' });
    });
    render(<ToastHost />);
    expect(screen.getByText('第一条')).toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();
  });

  it('clicking the close button dismisses the toast', () => {
    act(() => {
      useToastStore.getState().show({ message: 'clickable' });
    });
    render(<ToastHost />);
    const closeBtn = screen.getByRole('button', { name: /close|dismiss|关闭/i });
    fireEvent.click(closeBtn);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('disappears from DOM after store dismisses it', () => {
    act(() => {
      useToastStore.getState().show({ message: 'will-vanish' });
    });
    render(<ToastHost />);
    expect(screen.getByText('will-vanish')).toBeInTheDocument();
    act(() => {
      const id = useToastStore.getState().toasts[0].id;
      useToastStore.getState().dismiss(id);
    });
    expect(screen.queryByText('will-vanish')).not.toBeInTheDocument();
  });
});
