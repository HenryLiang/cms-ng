import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandPreset } from "@cms-ng/shared";
import { getBrandSettings } from "@/lib/brand-settings-api";
import { useBrandStore } from "./brand-store";

vi.mock("@/lib/brand-settings-api", () => ({
  getBrandSettings: vi.fn(),
}));

describe("brand-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandStore.setState(useBrandStore.getInitialState(), true);
  });

  it("loads the public brand once", async () => {
    vi.mocked(getBrandSettings).mockResolvedValue({
      preset: BrandPreset.SMART_MEDIA_HUB,
      name: "智媒中枢",
      logoUrl: "/brand-presets/smart-media-hub.png",
      isCustom: false,
    });

    await useBrandStore.getState().load();
    await useBrandStore.getState().load();

    expect(getBrandSettings).toHaveBeenCalledOnce();
    expect(useBrandStore.getState()).toMatchObject({
      brand: { name: "智媒中枢" },
      isLoaded: true,
    });
  });

  it("updates the active brand immediately after an administrator saves", () => {
    useBrandStore.getState().setBrand({
      preset: BrandPreset.CONTENT_ENGINE,
      name: "内容引擎",
      logoUrl: "/brand-presets/content-engine.png",
      isCustom: false,
    });

    expect(useBrandStore.getState()).toMatchObject({
      brand: { name: "内容引擎" },
      isLoaded: true,
    });
  });
});
