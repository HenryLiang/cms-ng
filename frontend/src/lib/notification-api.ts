import type { NotificationItem, NotificationList } from "@cms-ng/shared";
import { api } from "./api";

export async function getNotifications(limit = 20): Promise<NotificationList> {
  const response = await api.get("/notifications", { params: { limit } });
  return response.data;
}

export async function markNotificationRead(
  id: string,
): Promise<NotificationItem> {
  const response = await api.patch(
    `/notifications/${encodeURIComponent(id)}/read`,
  );
  return response.data;
}

export async function markAllNotificationsRead(): Promise<{
  updatedCount: number;
}> {
  const response = await api.patch("/notifications/read-all");
  return response.data;
}
