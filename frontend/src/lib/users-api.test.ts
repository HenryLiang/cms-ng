import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import {
  getEditors,
  getUsers,
  createUser,
  updateUserStatus,
  resetUserPassword,
  getUserConsumption,
  changePassword,
} from './users-api';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('users-api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getUsers', () => {
    it('should call GET /users and return the list', async () => {
      const mockUsers = [
        { id: 'u1', email: 'admin@example.com', name: '管理员', role: 'ADMIN' },
        { id: 'u2', email: 'reporter@example.com', name: '记者', role: 'REPORTER' },
      ];
      vi.mocked(api.get).mockResolvedValue({ data: mockUsers });

      const result = await getUsers();

      expect(api.get).toHaveBeenCalledWith('/users');
      expect(result).toBe(mockUsers);
      expect(result).toHaveLength(2);
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      await expect(getUsers()).rejects.toThrow('Network error');
    });
  });

  describe('getEditors', () => {
    it('should call GET /users/editors and return the list', async () => {
      const mockEditors = [
        { id: 'e1', email: 'editor@example.com', name: '编辑', role: 'EDITOR' },
      ];
      vi.mocked(api.get).mockResolvedValue({ data: mockEditors });

      const result = await getEditors();

      expect(api.get).toHaveBeenCalledWith('/users/editors');
      expect(result).toBe(mockEditors);
    });
  });

  describe('createUser', () => {
    it('should POST /users and return user + one-time password', async () => {
      const resp = { user: { id: 'u3', email: 'new@example.com' }, initialPassword: 'randompwd12' };
      vi.mocked(api.post).mockResolvedValue({ data: resp });

      const result = await createUser({ email: 'new@example.com', name: 'New' });

      expect(api.post).toHaveBeenCalledWith('/users', {
        email: 'new@example.com',
        name: 'New',
      });
      expect(result.initialPassword).toBe('randompwd12');
    });
  });

  describe('updateUserStatus', () => {
    it('should PATCH /users/:id/status with isActive', async () => {
      vi.mocked(api.patch).mockResolvedValue({ data: { id: 'u2', isActive: false } });

      const result = await updateUserStatus('u2', false);

      expect(api.patch).toHaveBeenCalledWith('/users/u2/status', { isActive: false });
      expect(result.isActive).toBe(false);
    });
  });

  describe('resetUserPassword', () => {
    it('should POST /users/:id/reset-password and return one-time password', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { password: 'newrandom12' } });

      const result = await resetUserPassword('u2');

      expect(api.post).toHaveBeenCalledWith('/users/u2/reset-password');
      expect(result.password).toBe('newrandom12');
    });
  });

  describe('getUserConsumption', () => {
    it('should GET /users/:id/consumption with pagination params', async () => {
      const resp = {
        user: { id: 'u2', balance: 80 },
        summary: { totalSpent: 10, totalTopUp: 100, transactionCount: 3, byType: {}, byCategory: {} },
        recentTransactions: [],
        meta: { page: 2, pageSize: 20, total: 5 },
      };
      vi.mocked(api.get).mockResolvedValue({ data: resp });

      const result = await getUserConsumption('u2', 2, 20);

      expect(api.get).toHaveBeenCalledWith('/users/u2/consumption', { params: { page: 2, pageSize: 20 } });
      expect(result.summary.totalSpent).toBe(10);
    });

    it('should default page/pageSize when omitted', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { summary: {}, recentTransactions: [], meta: {} } });

      await getUserConsumption('u2');

      expect(api.get).toHaveBeenCalledWith('/users/u2/consumption', { params: { page: 1, pageSize: 20 } });
    });
  });

  describe('changePassword', () => {
    it('should POST /users/me/password with both passwords', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { success: true } });

      await changePassword('old', 'new-password');

      expect(api.post).toHaveBeenCalledWith('/users/me/password', {
        currentPassword: 'old',
        newPassword: 'new-password',
      });
    });
  });
});
