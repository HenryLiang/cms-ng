import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocaleSwitcher from './locale-switcher';

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 清掉前一个用例写入的 NEXT_LOCALE(jsdom cookie 跨用例残留)
    document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
  });

  it('renders current locale (zh-CN default) with translated aria-label', () => {
    render(<LocaleSwitcher />);
    const btn = screen.getByRole('button', { name: '切换界面语言' });
    expect(btn).toHaveTextContent('简体中文');
  });

  it('opens the menu and lists both locales', () => {
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: '切换界面语言' }));
    expect(screen.getByRole('button', { name: /English/ })).toBeInTheDocument();
  });

  it('writes NEXT_LOCALE cookie and reloads when switching to English', async () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: '切换界面语言' }));
    fireEvent.click(screen.getByRole('button', { name: /English/ }));
    // cookie 写入:path/max-age 齐全,值 en
    await waitFor(() => {
      expect(document.cookie).toContain('NEXT_LOCALE=en');
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  it('does nothing when clicking the current locale', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    render(<LocaleSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: '切换界面语言' }));
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }));
    expect(document.cookie).not.toContain('NEXT_LOCALE');
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
