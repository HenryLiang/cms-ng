import type {
  ApiResponse,
  NotificationItem,
  NotificationList,
} from "@cms-ng/shared";
import { api } from "./api";

function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (response.success && response.data !== undefined) {
    return response.data;
  }
  throw new Error(response.error?.message ?? "通知接口返回异常");
}

export async function getNotifications(limit = 20): Promise<NotificationList> {
  const { data } = await api.get<ApiResponse<NotificationList>>(
    "/notifications",
    { params: { limit } },
  );
  return unwrapResponse(data);
}

export async function markNotificationRead(
  id: string,
): Promise<NotificationItem> {
  const { data } = await api.patch<ApiResponse<NotificationItem>>(
    `/notifications/${encodeURIComponent(id)}/read`,
  );
  return unwrapResponse(data);
}

export async function markAllNotificationsRead(): Promise<{
  updatedCount: number;
}> {
  const { data } = await api.patch<ApiResponse<{ updatedCount: number }>>(
    "/notifications/read-all",
  );
  return unwrapResponse(data);
}
