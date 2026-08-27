import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { BrandPreset } from "@cms-ng/shared";
import { getBrandSettings } from "@/lib/brand-settings-api";
import { BrandProvider } from "./brand-provider";

vi.mock("@/lib/brand-settings-api", () => ({
  getBrandSettings: vi.fn(),
}));

const initialBrand = {
  preset: BrandPreset.CONTENT_ENGINE,
  name: "内容引擎",
  logoUrl: "/brand-presets/content-engine.png",
  isCustom: false,
};

describe("BrandProvider", () => {
  beforeEach(() => {
    document.title = "";
    document.head
      .querySelectorAll('link[rel~="icon"]')
      .forEach((node) => node.remove());
    vi.mocked(getBrandSettings).mockResolvedValue(initialBrand);
  });

  it("applies the active name and logo to browser metadata", async () => {
    render(<BrandProvider initialBrand={initialBrand}>content</BrandProvider>);

    await waitFor(() => {
      expect(document.title).toContain("内容引擎");
      expect(
        document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
      ).toContain("/brand-presets/content-engine.png");
    });
  });
});
