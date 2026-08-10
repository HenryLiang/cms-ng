import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notification-api";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("notification-api", () => {
  afterEach(() => vi.clearAllMocks());

  it("loads the notification feed and calls both read endpoints", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [], unreadCount: 0 } },
    });
    vi.mocked(api.patch)
      .mockResolvedValueOnce({
        data: { success: true, data: { id: "notice-1" } },
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { updatedCount: 2 } },
      });

    await expect(getNotifications(20)).resolves.toEqual({
      items: [],
      unreadCount: 0,
    });
    await markNotificationRead("notice-1");
    await markAllNotificationsRead();

    expect(api.get).toHaveBeenCalledWith("/notifications", {
      params: { limit: 20 },
    });
    expect(api.patch).toHaveBeenNthCalledWith(
      1,
      "/notifications/notice-1/read",
    );
    expect(api.patch).toHaveBeenNthCalledWith(2, "/notifications/read-all");
  });

  it("rejects an unsuccessful API envelope", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: false,
        error: { code: "NOTIFICATION_ERROR", message: "通知接口异常" },
      },
    });

    await expect(getNotifications()).rejects.toThrow("通知接口异常");
  });
});
