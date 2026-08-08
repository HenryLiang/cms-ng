import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemFeature } from "@cms-ng/shared";
import { api } from "./api";
import {
  getFeatureStatuses,
  getSystemFeatureDetails,
  updateSystemFeature,
} from "./system-features-api";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("system-features-api", () => {
  afterEach(() => vi.clearAllMocks());

  it("unwraps the shared ApiResponse envelope for status and detail requests", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [{ key: SystemFeature.MEDIA, enabled: false }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: [{ key: SystemFeature.MEDIA, enabled: false, reason: "维护" }],
        },
      });

    await expect(getFeatureStatuses()).resolves.toEqual([
      { key: SystemFeature.MEDIA, enabled: false },
    ]);
    await expect(getSystemFeatureDetails()).resolves.toEqual([
      { key: SystemFeature.MEDIA, enabled: false, reason: "维护" },
    ]);
  });

  it("unwraps a feature update response", async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        success: true,
        data: { key: SystemFeature.MEDIA, enabled: false, reason: "维护" },
      },
    });

    await expect(
      updateSystemFeature(SystemFeature.MEDIA, false, "维护"),
    ).resolves.toMatchObject({
      key: SystemFeature.MEDIA,
      enabled: false,
    });
  });

  it("rejects an unsuccessful envelope instead of returning undefined", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: false,
        error: { code: "FEATURE_ERROR", message: "加载失败" },
      },
    });

    await expect(getFeatureStatuses()).rejects.toThrow("加载失败");
  });
});
