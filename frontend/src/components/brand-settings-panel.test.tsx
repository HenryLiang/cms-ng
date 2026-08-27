import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrandPreset } from "@cms-ng/shared";
import { updateBrandSettings } from "@/lib/brand-settings-api";
import { useBrandStore } from "@/store/brand-store";
import BrandSettingsPanel from "./brand-settings-panel";

vi.mock("@/lib/brand-settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brand-settings-api")>();
  return { ...actual, updateBrandSettings: vi.fn() };
});

describe("BrandSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBrandStore.setState({
      brand: {
        preset: BrandPreset.CMS_NG,
        name: "01创作大脑",
        logoUrl: "/brand-presets/cms-ng.svg",
        isCustom: false,
      },
      isLoaded: true,
      isLoading: false,
    });
  });

  it("switches to a built-in brand preset", async () => {
    vi.mocked(updateBrandSettings).mockResolvedValue({
      preset: BrandPreset.SMART_MEDIA_HUB,
      name: "智媒中枢",
      logoUrl: "/brand-presets/smart-media-hub.png",
      isCustom: false,
    });

    render(<BrandSettingsPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /智媒中枢/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存品牌设置" }));

    await waitFor(() => {
      expect(updateBrandSettings).toHaveBeenCalledWith({
        preset: BrandPreset.SMART_MEDIA_HUB,
      });
      expect(useBrandStore.getState().brand.name).toBe("智媒中枢");
    });
  });

  it("uploads a custom logo together with a custom name", async () => {
    vi.mocked(updateBrandSettings).mockResolvedValue({
      preset: BrandPreset.CUSTOM,
      name: "我的编辑部",
      logoUrl: "https://cdn.example.com/logo.webp",
      isCustom: true,
    });
    const logo = new File(["image"], "logo.png", { type: "image/png" });

    render(<BrandSettingsPanel />);
    fireEvent.click(screen.getByRole("radio", { name: /自定义品牌/ }));
    fireEvent.change(screen.getByLabelText("系统名称"), {
      target: { value: "我的编辑部" },
    });
    fireEvent.change(screen.getByLabelText("上传 Logo"), {
      target: { files: [logo] },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存品牌设置" }));

    await waitFor(() => {
      expect(updateBrandSettings).toHaveBeenCalledWith({
        preset: BrandPreset.CUSTOM,
        name: "我的编辑部",
        logo,
      });
    });
  });
});
