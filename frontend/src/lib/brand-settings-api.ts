import type { ApiResponse, BrandPreset, BrandSettings } from "@cms-ng/shared";
import { api } from "./api";

export interface SystemBrandSettings extends BrandSettings {
  updatedAt?: string | null;
  updatedBy?: { id: string; name: string; email: string } | null;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (response.success && response.data !== undefined) return response.data;
  throw new Error(response.error?.message ?? "Failed to load brand settings");
}

export async function getBrandSettings(): Promise<SystemBrandSettings> {
  const { data } =
    await api.get<ApiResponse<SystemBrandSettings>>("/brand-settings");
  return unwrap(data);
}

export async function updateBrandSettings(settings: {
  preset: BrandPreset;
  name?: string;
  logo?: File;
}): Promise<SystemBrandSettings> {
  const body = new FormData();
  body.set("preset", settings.preset);
  if (settings.name) body.set("name", settings.name);
  if (settings.logo) body.set("logo", settings.logo);

  const { data } = await api.patch<ApiResponse<SystemBrandSettings>>(
    "/brand-settings",
    body,
  );
  return unwrap(data);
}
