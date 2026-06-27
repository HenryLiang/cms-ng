import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-api', () => ({
  getRegistrationStatus: vi.fn(),
  toggleRegistration: vi.fn(),
}));

import SettingsPage from './page';
import { getRegistrationStatus, toggleRegistration } from '@/lib/auth-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage - registration switch', () => {
  it('renders the current open state on mount', async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({ registrationOpen: true });

    render(<SettingsPage />);

    expect(await screen.findByText('系统设置')).toBeInTheDocument();
    expect(screen.getByText('开放')).toBeInTheDocument();
    expect(screen.queryByText('关闭')).not.toBeInTheDocument();
  });

  it('renders the current closed state on mount', async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({ registrationOpen: false });

    render(<SettingsPage />);

    expect(await screen.findByText('关闭')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭注册' })).toBeInTheDocument();
  });

  it('toggles to closed and saves with a reason', async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({ registrationOpen: true });
    vi.mocked(toggleRegistration).mockResolvedValue({ registrationOpen: false });

    render(<SettingsPage />);

    const toggle = await screen.findByRole('button', { name: '开放注册' });
    fireEvent.click(toggle);
    await screen.findByRole('button', { name: '关闭注册' });

    fireEvent.change(screen.getByPlaceholderText(/正式上线前收口/), {
      target: { value: '维护收口' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(toggleRegistration).toHaveBeenCalledWith(false, '维护收口');
    });
    expect(await screen.findByText('已关闭注册')).toBeInTheDocument();
  });
});
