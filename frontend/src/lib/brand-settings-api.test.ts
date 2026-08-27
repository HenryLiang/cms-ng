import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandPreset } from "@cms-ng/shared";
import { api } from "./api";
import { getBrandSettings, updateBrandSettings } from "./brand-settings-api";

vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("brand-settings-api", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the public active brand", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          preset: BrandPreset.CMS_NG,
          name: "01创作大脑",
          logoUrl: "/brand-presets/cms-ng.svg",
          isCustom: false,
        },
      },
    });

    await expect(getBrandSettings()).resolves.toMatchObject({
      name: "01创作大脑",
    });
    expect(api.get).toHaveBeenCalledWith("/brand-settings");
  });

  it("sends preset, custom name and logo as multipart data", async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: {
        success: true,
        data: {
          preset: BrandPreset.CUSTOM,
          name: "我的编辑部",
          logoUrl: "https://cdn.example.com/logo.webp",
          isCustom: true,
        },
      },
    });
    const logo = new File(["logo"], "logo.png", { type: "image/png" });

    await updateBrandSettings({
      preset: BrandPreset.CUSTOM,
      name: "我的编辑部",
      logo,
    });

    expect(api.patch).toHaveBeenCalledOnce();
    const [url, body] = vi.mocked(api.patch).mock.calls[0];
    expect(url).toBe("/brand-settings");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("preset")).toBe(BrandPreset.CUSTOM);
    expect((body as FormData).get("name")).toBe("我的编辑部");
    expect((body as FormData).get("logo")).toBe(logo);
  });
});
