import type { ApiResponse, SystemFeatureDefinition } from "@cms-ng/shared";
import { SystemFeature } from "@cms-ng/shared";
import { api } from "./api";
import { libT } from "@/i18n/client-dict";

export interface SystemFeatureStatus extends SystemFeatureDefinition {
  enabled: boolean;
}

export interface SystemFeatureOperator {
  id: string;
  name: string;
  email: string;
}

export interface SystemFeatureDetail extends SystemFeatureStatus {
  reason: string | null;
  updatedAt: string | null;
  updatedBy: SystemFeatureOperator | null;
}

export interface SystemFeatureAudit {
  id: string;
  feature: SystemFeature;
  previousEnabled: boolean;
  enabled: boolean;
  reason: string | null;
  createdAt: string;
  operator: SystemFeatureOperator | null;
}

function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (response.success && response.data !== undefined) {
    return response.data;
  }
  throw new Error(response.error?.message ?? libT('systemFeatures.apiError'));
}

export async function getFeatureStatuses(): Promise<SystemFeatureStatus[]> {
  const { data } = await api.get<ApiResponse<SystemFeatureStatus[]>>(
    "/system-features/status",
  );
  return unwrapResponse(data);
}

export async function getSystemFeatureDetails(): Promise<
  SystemFeatureDetail[]
> {
  const { data } =
    await api.get<ApiResponse<SystemFeatureDetail[]>>("/system-features");
  return unwrapResponse(data);
}

export async function updateSystemFeature(
  feature: SystemFeature,
  enabled: boolean,
  reason?: string,
): Promise<SystemFeatureDetail> {
  const { data } = await api.patch<ApiResponse<SystemFeatureDetail>>(
    `/system-features/${feature}`,
    { enabled, reason },
  );
  return unwrapResponse(data);
}

export async function getSystemFeatureAudit(
  feature: SystemFeature,
): Promise<SystemFeatureAudit[]> {
  const { data } = await api.get<ApiResponse<SystemFeatureAudit[]>>(
    `/system-features/${feature}/audit`,
  );
  return unwrapResponse(data);
}
