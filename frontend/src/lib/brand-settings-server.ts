import "server-only";

import { cache } from "react";
import {
  DEFAULT_BRAND_SETTINGS,
  type ApiResponse,
  type BrandSettings,
} from "@cms-ng/shared";

function backendBaseUrl(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:3001"
  ).replace(/\/$/, "");
}

export const getServerBrandSettings = cache(
  async (): Promise<BrandSettings> => {
    try {
      const response = await fetch(`${backendBaseUrl()}/brand-settings`, {
        cache: "no-store",
      });
      if (!response.ok) return DEFAULT_BRAND_SETTINGS;
      const body = (await response.json()) as ApiResponse<BrandSettings>;
      if (!body.success || !body.data?.name || !body.data.logoUrl) {
        return DEFAULT_BRAND_SETTINGS;
      }
      return body.data;
    } catch {
      return DEFAULT_BRAND_SETTINGS;
    }
  },
);
