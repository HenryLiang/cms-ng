import { beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { BrandPreset } from "@cms-ng/shared";
import { useBrandStore } from "@/store/brand-store";
import { BrandProvider } from "./brand-provider";

describe("BrandProvider", () => {
  beforeEach(() => {
    document.title = "";
    document.head.querySelectorAll('link[rel~="icon"]').forEach((node) => node.remove());
    useBrandStore.setState({
      brand: {
        preset: BrandPreset.CONTENT_ENGINE,
        name: "内容引擎",
        logoUrl: "/brand-presets/content-engine.png",
        isCustom: false,
      },
      isLoaded: true,
      isLoading: false,
    });
  });

  it("applies the active name and logo to browser metadata", async () => {
    render(<BrandProvider>content</BrandProvider>);

    await waitFor(() => {
      expect(document.title).toContain("内容引擎");
      expect(
        document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
      ).toContain("/brand-presets/content-engine.png");
    });
  });
});
