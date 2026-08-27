"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from "@cms-ng/shared";
import { getBrandSettings } from "@/lib/brand-settings-api";

interface BrandContextValue {
  brand: BrandSettings;
  setBrand: (brand: BrandSettings) => void;
}

const BrandContext = createContext<BrandContextValue>({
  brand: DEFAULT_BRAND_SETTINGS,
  setBrand: () => undefined,
});

export function useBrand(): BrandContextValue {
  return useContext(BrandContext);
}

export function BrandProvider({
  children,
  initialBrand = DEFAULT_BRAND_SETTINGS,
}: {
  children: React.ReactNode;
  initialBrand?: BrandSettings;
}) {
  const t = useTranslations("meta");
  const [brand, setBrand] = useState(initialBrand);

  useEffect(() => {
    let cancelled = false;
    void getBrandSettings()
      .then((latest) => {
        if (!cancelled) setBrand(latest);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = t("titleWithName", { name: brand.name });

    let favicon =
      document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.href = brand.logoUrl;
  }, [brand.logoUrl, brand.name, t]);

  const value = useMemo(() => ({ brand, setBrand }), [brand]);
  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
}
