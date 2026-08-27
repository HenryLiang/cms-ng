import type { ApiResponse, BrandPreset, BrandSettings } from "@cms-ng/shared";
import { libT } from "@/i18n/client-dict";
import { api } from "./api";

function unwrap<T>(response: ApiResponse<T>): T {
  if (response.success && response.data !== undefined) return response.data;
  throw new Error(response.error?.message ?? libT("brandSettings.apiError"));
}

export async function getBrandSettings(): Promise<BrandSettings> {
  const { data } = await api.get<ApiResponse<BrandSettings>>("/brand-settings");
  return unwrap(data);
}

export async function updateBrandSettings(settings: {
  preset: BrandPreset;
  name?: string;
  logo?: File;
}): Promise<BrandSettings> {
  const body = new FormData();
  body.set("preset", settings.preset);
  if (settings.name) body.set("name", settings.name);
  if (settings.logo) body.set("logo", settings.logo);

  const { data } = await api.patch<ApiResponse<BrandSettings>>(
    "/brand-settings",
    body,
  );
  return unwrap(data);
}
