import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/users-api', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUserStatus: vi.fn(),
  resetUserPassword: vi.fn(),
  getUserConsumption: vi.fn(),
}));

import AccountsPage from './page';
import {
  getUsers,
  createUser,
  updateUserStatus,
  getUserConsumption,
} from '@/lib/users-api';

beforeEach(() => {
  vi.clearAllMocks();
});

const activeUser = {
  id: 'u1',
  email: 'reporter@example.com',
  name: '张三',
  role: 'REPORTER',
  department: '要闻',
  isActive: true,
  balance: 80,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('AccountsPage', () => {
  it('renders the account list on mount', async () => {
    vi.mocked(getUsers).mockResolvedValue([activeUser]);

    render(<AccountsPage />);

    expect(await screen.findByText('张三')).toBeInTheDocument();
    expect(screen.getByText('reporter@example.com')).toBeInTheDocument();
    expect(screen.getByText('启用')).toBeInTheDocument();
    expect(screen.getByText(/¥80\.00/)).toBeInTheDocument();
  });

  it('shows empty state when there are no users', async () => {
    vi.mocked(getUsers).mockResolvedValue([]);

    render(<AccountsPage />);

    expect(await screen.findByText('暂无账户')).toBeInTheDocument();
  });

  it('creates an account and shows the one-time password', async () => {
    vi.mocked(getUsers).mockResolvedValue([]);
    vi.mocked(createUser).mockResolvedValue({
      user: { id: 'u2', email: 'new@example.com', name: '新用户', role: 'REPORTER' },
      initialPassword: 'Ab3xY9Km2pQr',
    });

    render(<AccountsPage />);
    await screen.findByText('暂无账户');

    fireEvent.click(screen.getByRole('button', { name: /新建账户/ }));

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '新用户' } });

    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', name: '新用户' }),
      );
    });
    // one-time password shown
    expect(await screen.findByText('Ab3xY9Km2pQr')).toBeInTheDocument();
    expect(screen.getByText(/仅显示一次/)).toBeInTheDocument();
  });

  it('disables an active account on toggle', async () => {
    vi.mocked(getUsers).mockResolvedValue([activeUser]);
    vi.mocked(updateUserStatus).mockResolvedValue({ ...activeUser, isActive: false });

    render(<AccountsPage />);
    await screen.findByText('张三');

    fireEvent.click(screen.getByRole('button', { name: /禁用/ }));

    await waitFor(() => {
      expect(updateUserStatus).toHaveBeenCalledWith('u1', false);
    });
    expect(await screen.findByText('已禁用账户')).toBeInTheDocument();
  });

  it('opens the consumption drawer with summary data', async () => {
    vi.mocked(getUsers).mockResolvedValue([activeUser]);
    vi.mocked(getUserConsumption).mockResolvedValue({
      user: { ...activeUser, balance: 80 },
      summary: {
        totalSpent: 123.5,
        totalTopUp: 200,
        transactionCount: 2,
        byType: { AI_LLM: 123.5 },
        byCategory: { AI: 123.5 },
      },
      recentTransactions: [],
      meta: { page: 1, pageSize: 10, total: 0 },
    });

    render(<AccountsPage />);
    await screen.findByText('张三');

    fireEvent.click(screen.getByRole('button', { name: /消费/ }));

    expect(await screen.findByText('账户消费')).toBeInTheDocument();
    await waitFor(() => {
      expect(getUserConsumption).toHaveBeenCalledWith('u1', 1, 10);
    });
    expect(screen.getAllByText(/¥123\.50/).length).toBeGreaterThan(0);
    expect(screen.getByText('AI 消费')).toBeInTheDocument();
  });
});
