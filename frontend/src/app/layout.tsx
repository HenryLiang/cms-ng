import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { BrandProvider } from "@/components/brand-provider";
import { getServerBrandSettings } from "@/lib/brand-settings-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const [t, brand] = await Promise.all([
    getTranslations({ locale, namespace: "meta" }),
    getServerBrandSettings(),
  ]);
  return {
    title: t("titleWithName", { name: brand.name }),
    description: t("description"),
    icons: { icon: brand.logoUrl },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, brand] = await Promise.all([
    getLocale(),
    getServerBrandSettings(),
  ]);
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-foreground">
        <NextIntlClientProvider>
          <BrandProvider initialBrand={brand}>
            <AuthProvider>{children}</AuthProvider>
          </BrandProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
