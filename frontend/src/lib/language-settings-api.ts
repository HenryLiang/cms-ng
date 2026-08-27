import type {
  ApiResponse,
  ContentLanguage,
  DisplayLanguage,
  LanguageSettings,
} from "@cms-ng/shared";
import { api } from "./api";

export interface SystemLanguageSettings extends LanguageSettings {
  updatedAt: string | null;
  updatedBy: { id: string; name: string; email: string } | null;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (response.success && response.data !== undefined) return response.data;
  throw new Error(
    response.error?.message ?? "Failed to load language settings",
  );
}

export async function getLanguageSettings(): Promise<SystemLanguageSettings> {
  const { data } =
    await api.get<ApiResponse<SystemLanguageSettings>>("/language-settings");
  return unwrap(data);
}

export async function updateLanguageSettings(settings: {
  displayLanguage: DisplayLanguage;
  contentLanguage: ContentLanguage;
}): Promise<SystemLanguageSettings> {
  const { data } = await api.patch<ApiResponse<SystemLanguageSettings>>(
    "/language-settings",
    settings,
  );
  return unwrap(data);
}
