import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore } from './toast-store';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('toast-store', () => {
  it('starts with an empty toasts list', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('show() appends a toast with a generated id and defaults type=info', () => {
    useToastStore.getState().show({ message: 'hello' });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('hello');
    expect(toasts[0].type).toBe('info');
    expect(typeof toasts[0].id).toBe('string');
    expect(toasts[0].id.length).toBeGreaterThan(0);
  });

  it('show() respects an explicit type', () => {
    useToastStore.getState().show({ message: 'oops', type: 'error' });
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('dismiss() removes a toast by id', () => {
    useToastStore.getState().show({ message: 'a' });
    useToastStore.getState().show({ message: 'b' });
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().dismiss(id);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('b');
  });

  it('auto-dismisses a toast after the specified duration (default 4000ms)', () => {
    vi.useFakeTimers();
    useToastStore.getState().show({ message: 'transient' });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });

  it('respects duration=0 (does not auto-dismiss)', () => {
    vi.useFakeTimers();
    useToastStore.getState().show({ message: 'sticky', duration: 0 });
    vi.advanceTimersByTime(60_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.useRealTimers();
  });

  it('caps concurrent toasts at MAX_VISIBLE (oldest is dropped)', () => {
    for (let i = 0; i < 6; i++) {
      useToastStore.getState().show({ message: `t${i}` });
    }
    const toasts = useToastStore.getState().toasts;
    // We expose MAX_VISIBLE implicitly: it should be a small number like 5
    expect(toasts.length).toBeLessThanOrEqual(5);
    // The newest should be present
    expect(toasts[toasts.length - 1].message).toBe('t5');
  });
});
