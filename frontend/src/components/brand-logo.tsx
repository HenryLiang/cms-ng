"use client";

import type { BrandSettings } from "@cms-ng/shared";
import { cn } from "@/components/ui/cn";
import { useBrand } from "./brand-provider";

export default function BrandLogo({
  brand: explicitBrand,
  className,
  alt,
}: {
  brand?: BrandSettings;
  className?: string;
  alt?: string;
}) {
  const { brand: activeBrand } = useBrand();
  const brand = explicitBrand ?? activeBrand;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL 可由管理员配置，next/image 无法预声明远端域名
    <img
      src={brand.logoUrl}
      alt={alt ?? `${brand.name} Logo`}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
