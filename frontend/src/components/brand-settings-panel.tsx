"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ImageUp, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  BRAND_PRESET_CATALOG,
  BrandPreset,
  type BrandPresetDefinition,
  type BrandSettings,
} from "@cms-ng/shared";
import { updateBrandSettings } from "@/lib/brand-settings-api";
import { Button, Card } from "@/components/ui";
import BrandLogo from "./brand-logo";
import { useBrand } from "./brand-provider";

const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function presetBrand(preset: BrandPresetDefinition): BrandSettings {
  return {
    preset: preset.key,
    name: preset.name,
    logoUrl: preset.logoUrl,
    isCustom: false,
  };
}

function apiMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    return (
      (error as { response?: { data?: { message?: string } } }).response?.data
        ?.message ?? fallback
    );
  }
  return fallback;
}

export default function BrandSettingsPanel() {
  const t = useTranslations("settings.branding");
  const { brand, setBrand } = useBrand();
  const [selected, setSelected] = useState(brand.preset);
  const [name, setName] = useState(brand.isCustom ? brand.name : "");
  const [logo, setLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const customPreview = useMemo<BrandSettings | null>(() => {
    const logoUrl = previewUrl ?? (brand.isCustom ? brand.logoUrl : null);
    if (!logoUrl) return null;
    return {
      preset: BrandPreset.CUSTOM,
      name: name.trim() || t("custom.title"),
      logoUrl,
      isCustom: true,
    };
  }, [brand.isCustom, brand.logoUrl, name, previewUrl, t]);

  const customReady =
    selected !== BrandPreset.CUSTOM ||
    (name.trim().length >= 2 && Boolean(logo || brand.isCustom));

  function resetDraft() {
    if (previewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(previewUrl);
    }
    setSelected(brand.preset);
    setName(brand.isCustom ? brand.name : "");
    setLogo(null);
    setPreviewUrl(null);
    setMessage(null);
  }

  function selectLogo(file: File | undefined) {
    setMessage(null);
    if (!file) {
      setLogo(null);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setMessage({ type: "error", text: t("custom.invalidType") });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMessage({ type: "error", text: t("custom.tooLarge") });
      return;
    }
    setLogo(file);
    if (previewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null,
    );
  }

  async function save() {
    if (!customReady) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated =
        selected === BrandPreset.CUSTOM
          ? await updateBrandSettings({
              preset: selected,
              name: name.trim(),
              ...(logo ? { logo } : {}),
            })
          : await updateBrandSettings({ preset: selected });
      setBrand(updated);
      setSelected(updated.preset);
      setName(updated.isCustom ? updated.name : "");
      setLogo(null);
      setPreviewUrl(null);
      setMessage({ type: "success", text: t("saved") });
    } catch (error) {
      setMessage({
        type: "error",
        text: apiMessage(error, t("saveFailed")),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-4xl p-6">
      <div>
        <h2 className="text-base font-medium">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("description")}</p>
      </div>

      <div
        className="mt-6 grid gap-3 sm:grid-cols-3"
        role="radiogroup"
        aria-label={t("presetsLabel")}
      >
        {BRAND_PRESET_CATALOG.map((preset) => {
          const active = selected === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={preset.name}
              onClick={() => {
                setSelected(preset.key);
                setMessage(null);
              }}
              className={`relative rounded-xl border p-4 text-left transition ${
                active
                  ? "border-brand bg-brand-soft ring-2 ring-brand/20"
                  : "border-line hover:border-line-strong hover:bg-surface-muted"
              }`}
            >
              {active && (
                <span className="absolute right-3 top-3 rounded-full bg-brand p-1 text-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <BrandLogo
                brand={presetBrand(preset)}
                className="h-14 w-14"
                alt=""
              />
              <p className="mt-3 text-sm font-semibold">{preset.name}</p>
              {preset.key === BrandPreset.CMS_NG && (
                <p className="mt-1 text-xs text-muted">{t("currentPreset")}</p>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        role="radio"
        aria-checked={selected === BrandPreset.CUSTOM}
        aria-label={t("custom.title")}
        onClick={() => {
          setSelected(BrandPreset.CUSTOM);
          setMessage(null);
        }}
        className={`mt-3 flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
          selected === BrandPreset.CUSTOM
            ? "border-brand bg-brand-soft ring-2 ring-brand/20"
            : "border-line hover:border-line-strong hover:bg-surface-muted"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface">
          {customPreview ? (
            <BrandLogo brand={customPreview} className="h-12 w-12" alt="" />
          ) : (
            <ImageUp className="h-5 w-5 text-muted" />
          )}
        </span>
        <span>
          <span className="block text-sm font-semibold">
            {t("custom.title")}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {t("custom.description")}
          </span>
        </span>
      </button>

      {selected === BrandPreset.CUSTOM && (
        <div className="mt-4 grid gap-4 rounded-xl border border-line bg-surface-muted/60 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="brand-name" className="text-sm font-medium">
              {t("custom.nameLabel")}
            </label>
            <input
              id="brand-name"
              value={name}
              minLength={2}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("custom.namePlaceholder")}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="text-xs text-muted">{t("custom.nameHint")}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="brand-logo" className="text-sm font-medium">
              {t("custom.logoLabel")}
            </label>
            <input
              id="brand-logo"
              type="file"
              accept={ACCEPTED_LOGO_TYPES.join(",")}
              onChange={(event) => selectLogo(event.target.files?.[0])}
              className="block w-full rounded-lg border border-line bg-surface text-sm text-muted file:mr-3 file:border-0 file:border-r file:border-line file:bg-surface-muted file:px-3 file:py-2.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted">
              {logo
                ? t("custom.selectedFile", { name: logo.name })
                : t("custom.logoHint")}
            </p>
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mt-4 text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6 flex gap-2 border-t border-line pt-4">
        <Button onClick={save} loading={saving} disabled={!customReady}>
          <Save className="h-4 w-4" />
          {t("save")}
        </Button>
        <Button variant="secondary" onClick={resetDraft} disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          {t("reset")}
        </Button>
      </div>
    </Card>
  );
}
