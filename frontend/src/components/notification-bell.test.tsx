import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationLevel,
  NotificationType,
  type NotificationItem,
} from "@cms-ng/shared";

vi.mock("@/lib/notification-api", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import NotificationBell from "./notification-bell";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-api";

const item: NotificationItem = {
  id: "notice-1",
  type: NotificationType.TASK,
  level: NotificationLevel.SUCCESS,
  title: "视频生成完成",
  message: "“一只柴犬”已生成，可前往视频创作查看。",
  actionUrl: "/dashboard/video",
  metadata: { jobId: "job-1" },
  readAt: null,
  createdAt: "2026-08-10T02:00:00.000Z",
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNotifications).mockResolvedValue({
      items: [item],
      unreadCount: 1,
    });
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...item,
      readAt: "2026-08-10T02:01:00.000Z",
    });
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ updatedCount: 1 });
  });

  it("shows unread notifications and marks an opened item as read", async () => {
    render(<NotificationBell />);

    const trigger = await screen.findByRole("button", {
      name: "通知，1 条未读",
    });
    fireEvent.click(trigger);

    expect(await screen.findByText("视频生成完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /视频生成完成/ }));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("notice-1");
    });
    expect(
      screen.getByRole("button", { name: "通知，无未读消息" }),
    ).toBeInTheDocument();
  });

  it("marks every notification as read from the panel header", async () => {
    render(<NotificationBell />);
    fireEvent.click(
      await screen.findByRole("button", { name: "通知，1 条未读" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "全部已读" }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: "通知，无未读消息" }),
    ).toBeInTheDocument();
  });
});
