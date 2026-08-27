"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useBrandStore } from "@/store/brand-store";

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("meta");
  const brand = useBrandStore((state) => state.brand);
  const isLoaded = useBrandStore((state) => state.isLoaded);
  const load = useBrandStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoaded) return;
    document.title = t("titleWithName", { name: brand.name });

    let favicon = document.head.querySelector<HTMLLinkElement>(
      'link[rel~="icon"]',
    );
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = brand.logoUrl;
  }, [brand.logoUrl, brand.name, isLoaded, t]);

  return <>{children}</>;
}
