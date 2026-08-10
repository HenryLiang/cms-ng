import { NotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  const notifications = {
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
  const controller = new NotificationsController(
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('wraps the notification feed in ApiResponse', async () => {
    notifications.list.mockResolvedValue({ items: [], unreadCount: 0 });

    await expect(controller.list('user-1', { limit: 12 })).resolves.toEqual({
      success: true,
      data: { items: [], unreadCount: 0 },
    });
    expect(notifications.list).toHaveBeenCalledWith('user-1', 12);
  });

  it('wraps single and bulk read mutations in ApiResponse', async () => {
    notifications.markRead.mockResolvedValue({ id: 'notice-1' });
    notifications.markAllRead.mockResolvedValue({ updatedCount: 2 });

    await expect(controller.markRead('user-1', 'notice-1')).resolves.toEqual({
      success: true,
      data: { id: 'notice-1' },
    });
    await expect(controller.markAllRead('user-1')).resolves.toEqual({
      success: true,
      data: { updatedCount: 2 },
    });
  });
});
