import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentLanguage } from "@cms-ng/shared";
import { api } from "./api";
import {
  getLanguageSettings,
  updateLanguageSettings,
} from "./language-settings-api";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("language-settings-api", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the public system defaults", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          displayLanguage: "zh-CN",
          contentLanguage: ContentLanguage.SIMPLIFIED_CHINESE,
        },
      },
    });

    await expect(getLanguageSettings()).resolves.toMatchObject({
      displayLanguage: "zh-CN",
      contentLanguage: ContentLanguage.SIMPLIFIED_CHINESE,
    });
    expect(api.get).toHaveBeenCalledWith("/language-settings");
  });

  it("updates both defaults in one request", async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        success: true,
        data: {
          displayLanguage: "en",
          contentLanguage: ContentLanguage.ENGLISH,
          updatedAt: "2026-08-27T01:00:00.000Z",
          updatedBy: null,
        },
      },
    });

    await updateLanguageSettings({
      displayLanguage: "en",
      contentLanguage: ContentLanguage.ENGLISH,
    });

    expect(api.patch).toHaveBeenCalledWith("/language-settings", {
      displayLanguage: "en",
      contentLanguage: ContentLanguage.ENGLISH,
    });
  });
});
