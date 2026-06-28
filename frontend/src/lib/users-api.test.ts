import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import { getEditors, getUsers } from './users-api';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
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

    it('should propagate API errors', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      await expect(getEditors()).rejects.toThrow('Network error');
    });
  });
});
