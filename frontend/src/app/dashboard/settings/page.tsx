"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { History, LockKeyhole, Save, X } from "lucide-react";
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DEFAULT_DISPLAY_LANGUAGE,
  SystemFeature,
  UserRole,
  type DisplayLanguage,
} from "@cms-ng/shared";
import { getRegistrationStatus, toggleRegistration } from "@/lib/auth-api";
import {
  getSystemFeatureAudit,
  getSystemFeatureDetails,
  updateSystemFeature,
  type SystemFeatureAudit,
  type SystemFeatureDetail,
} from "@/lib/system-features-api";
import { getVideoCapability, type VideoCapability } from "@/lib/video-api";
import { useAuthStore } from "@/store/auth-store";
import { useSystemFeaturesStore } from "@/store/system-features-store";
import { Button, Card, PageHeader, Badge } from "@/components/ui";
import {
  getLanguageSettings,
  updateLanguageSettings,
  type SystemLanguageSettings,
} from "@/lib/language-settings-api";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/config";

type SettingsTab = "registration" | "languages" | "features";
type PendingChange = { feature: SystemFeatureDetail; enabled: boolean };

// 分组存词典 key(features.groups.*),渲染处经 t() 解析
const GROUP_KEYS = {
  WORKSPACE: "workspace",
  AUTOMATION: "automation",
  SYSTEM: "system",
} as const;

function apiMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    return (
      (error as { response?: { data?: { message?: string } } }).response?.data
        ?.message ?? fallback
    );
  }
  return fallback;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const user = useAuthStore((state) => state.user);
  const setFeatureStatus = useSystemFeaturesStore((state) => state.setStatus);
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const [tab, setTab] = useState<SettingsTab>("registration");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [editOpen, setEditOpen] = useState(true);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [features, setFeatures] = useState<SystemFeatureDetail[]>([]);
  const [featuresLoading, setFeaturesLoading] = useState(isSuperAdmin);
  const [featureMessage, setFeatureMessage] = useState<string | null>(null);
  const [videoCapability, setVideoCapability] =
    useState<VideoCapability | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [changing, setChanging] = useState(false);
  const [auditFeature, setAuditFeature] = useState<SystemFeatureDetail | null>(
    null,
  );
  const [audit, setAudit] = useState<SystemFeatureAudit[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [languageSettings, setLanguageSettings] =
    useState<SystemLanguageSettings | null>(null);
  const [languageDraft, setLanguageDraft] = useState({
    displayLanguage: DEFAULT_DISPLAY_LANGUAGE as DisplayLanguage,
    contentLanguage: DEFAULT_CONTENT_LANGUAGE,
  });
  const [languageLoading, setLanguageLoading] = useState(isSuperAdmin);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageMessage, setLanguageMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    getRegistrationStatus()
      .then((data) => {
        setRegistrationOpen(data.registrationOpen);
        setEditOpen(data.registrationOpen);
      })
      .catch(() => setMessage({ type: "error", text: t("registration.loadFailed") }))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount,t 仅为词典引用刻意不入 deps
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    Promise.all([
      getSystemFeatureDetails(),
      getVideoCapability().catch(() => null),
    ])
      .then(([details, capability]) => {
        if (cancelled) return;
        setFeatures(details);
        setVideoCapability(capability);
      })
      .catch((error) => {
        if (!cancelled) {
          setFeatureMessage(apiMessage(error, t("features.loadFailed")));
        }
      })
      .finally(() => {
        if (!cancelled) setFeaturesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 仅为词典引用刻意不入 deps
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    getLanguageSettings()
      .then((settings) => {
        if (cancelled) return;
        setLanguageSettings(settings);
        setLanguageDraft({
          displayLanguage: settings.displayLanguage,
          contentLanguage: settings.contentLanguage,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setLanguageMessage({
            type: "error",
            text: apiMessage(error, t("languages.loadFailed")),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLanguageLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-role-change, t 仅为词典引用刻意不入 deps
  }, [isSuperAdmin]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const data = await toggleRegistration(
        editOpen,
        reason.trim() || undefined,
      );
      setRegistrationOpen(data.registrationOpen);
      setReason("");
      setMessage({
        type: "success",
        text: data.registrationOpen
          ? t("registration.opened")
          : t("registration.closedMessage"),
      });
    } catch (error) {
      setMessage({ type: "error", text: apiMessage(error, t("registration.saveFailed")) });
    } finally {
      setSaving(false);
    }
  }

  async function confirmFeatureChange() {
    if (!pending || (!pending.enabled && !changeReason.trim())) return;
    setChanging(true);
    setFeatureMessage(null);
    try {
      const updated = await updateSystemFeature(
        pending.feature.key,
        pending.enabled,
        changeReason.trim() || undefined,
      );
      setFeatures((items) =>
        items.map((item) => (item.key === updated.key ? updated : item)),
      );
      setFeatureStatus(updated.key, updated.enabled);
      setFeatureMessage(
        updated.enabled
          ? t("features.openedMessage", { label: updated.label })
          : t("features.closedMessage", { label: updated.label }),
      );
      setPending(null);
      setChangeReason("");
    } catch (error) {
      setFeatureMessage(apiMessage(error, t("features.updateFailed")));
    } finally {
      setChanging(false);
    }
  }

  async function openAudit(feature: SystemFeatureDetail) {
    setAuditFeature(feature);
    setAudit([]);
    setAuditLoading(true);
    try {
      setAudit(await getSystemFeatureAudit(feature.key));
    } catch (error) {
      setFeatureMessage(apiMessage(error, t("features.audit.loadFailed")));
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleLanguageSave() {
    setLanguageSaving(true);
    setLanguageMessage(null);
    try {
      const updated = await updateLanguageSettings(languageDraft);
      setLanguageSettings(updated);
      setLanguageDraft({
        displayLanguage: updated.displayLanguage,
        contentLanguage: updated.contentLanguage,
      });
      if (!user?.displayLanguage && updated.displayLanguage !== locale) {
        document.cookie = `${LOCALE_COOKIE}=${updated.displayLanguage}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
        location.reload();
        return;
      }
      setLanguageMessage({ type: "success", text: t("languages.saved") });
    } catch (error) {
      setLanguageMessage({
        type: "error",
        text: apiMessage(error, t("languages.saveFailed")),
      });
    } finally {
      setLanguageSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-5 flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setTab("registration")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "registration"
              ? "border-brand text-brand"
              : "border-transparent text-muted"
          }`}
        >
          {t("tabs.registration")}
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setTab("languages")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "languages"
                ? "border-brand text-brand"
                : "border-transparent text-muted"
            }`}
          >
            {t("tabs.languages")}
          </button>
        )}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setTab("features")}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === "features"
                ? "border-brand text-brand"
                : "border-transparent text-muted"
            }`}
          >
            {t("tabs.features")}
          </button>
        )}
      </div>

      {tab === "registration" ? (
        <RegistrationSettings
          registrationOpen={registrationOpen}
          editOpen={editOpen}
          reason={reason}
          message={message}
          saving={saving}
          onToggle={() => setEditOpen((value) => !value)}
          onReason={setReason}
          onSave={handleSave}
          onReset={() => {
            setEditOpen(registrationOpen);
            setReason("");
            setMessage(null);
          }}
        />
      ) : tab === "languages" ? (
        <LanguageDefaultsSettings
          settings={languageSettings}
          draft={languageDraft}
          loading={languageLoading}
          saving={languageSaving}
          message={languageMessage}
          onDraft={setLanguageDraft}
          onSave={handleLanguageSave}
          onReset={() => {
            if (!languageSettings) return;
            setLanguageDraft({
              displayLanguage: languageSettings.displayLanguage,
              contentLanguage: languageSettings.contentLanguage,
            });
            setLanguageMessage(null);
          }}
        />
      ) : (
        <FeatureSettings
          features={features}
          loading={featuresLoading}
          message={featureMessage}
          videoCapability={videoCapability}
          onChange={(feature, enabled) => {
            setPending({ feature, enabled });
            setChangeReason("");
          }}
          onAudit={openAudit}
        />
      )}

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("features.confirmAria")}
        >
          <Card className="w-full max-w-lg p-6">
            <h2 className="text-base font-semibold">
              {pending.enabled
                ? t("features.enableWithLabel", { label: pending.feature.label })
                : t("features.disableWithLabel", { label: pending.feature.label })}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {pending.enabled
                ? t("features.enableDescription")
                : t("features.disableDescription")}
            </p>
            <textarea
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              rows={3}
              placeholder={
                pending.enabled
                  ? t("features.reasonPlaceholderOptional")
                  : t("features.reasonPlaceholderRequired")
              }
              className="mt-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setPending(null)}
                disabled={changing}
              >
                {tCommon("actions.cancel")}
              </Button>
              <Button
                variant={pending.enabled ? "primary" : "danger"}
                loading={changing}
                disabled={!pending.enabled && !changeReason.trim()}
                onClick={confirmFeatureChange}
              >
                {pending.enabled
                  ? t("features.confirmEnable")
                  : t("features.confirmDisable")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {auditFeature && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-label={t("features.audit.title", { label: auditFeature.label })}
        >
          <div className="h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-pop">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  {t("features.audit.title", { label: auditFeature.label })}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {t("features.audit.limitHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditFeature(null)}
                aria-label={t("features.audit.closeAria")}
                className="rounded-lg p-2 text-muted hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {auditLoading ? (
              <p className="text-sm text-muted">{tCommon("state.loading")}</p>
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted">{t("features.audit.empty")}</p>
            ) : (
              <div className="space-y-3">
                {audit.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-line p-4"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>
                        {item.previousEnabled ? t("states.open") : t("states.closed")}
                      </span>
                      <span className="text-subtle">-&gt;</span>
                      <span>{item.enabled ? t("states.open") : t("states.closed")}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {item.reason || t("features.noReason")}
                    </p>
                    <p className="mt-2 text-xs text-subtle">
                      {item.operator?.name || t("features.systemOperator")} ·{" "}
                      {new Date(item.createdAt).toLocaleString(locale)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RegistrationSettings(props: {
  registrationOpen: boolean;
  editOpen: boolean;
  reason: string;
  message: { type: "success" | "error"; text: string } | null;
  saving: boolean;
  onToggle: () => void;
  onReason: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  return (
    <Card className="max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-base font-medium">{t("registration.title")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("registration.description")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">{t("registration.currentStatus")}</span>
        <Badge tone={props.registrationOpen ? "success" : "neutral"}>
          {props.registrationOpen ? t("states.open") : t("states.closed")}
        </Badge>
      </div>
      <div className="space-y-4 border-t border-line pt-4">
        <div className="flex items-center gap-3">
          <Switch
            enabled={props.editOpen}
            label={
              props.editOpen
                ? t("registration.openAction")
                : t("registration.closeAction")
            }
            onClick={props.onToggle}
          />
          <span className="text-sm font-medium">
            {props.editOpen
              ? t("registration.openAction")
              : t("registration.closeAction")}
          </span>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("registration.reasonLabel")}
          </label>
          <textarea
            value={props.reason}
            onChange={(event) => props.onReason(event.target.value)}
            rows={2}
            placeholder={t("registration.reasonPlaceholder")}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        {props.message && (
          <div
            className={`rounded-lg px-4 py-2.5 text-sm ${
              props.message.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {props.message.text}
          </div>
        )}
        <div className="flex gap-3">
          <Button loading={props.saving} onClick={props.onSave}>
            {!props.saving && <Save className="h-4 w-4" />}
            {tCommon("actions.save")}
          </Button>
          <Button
            variant="secondary"
            disabled={props.saving}
            onClick={props.onReset}
          >
            {t("registration.reset")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LanguageDefaultsSettings(props: {
  settings: SystemLanguageSettings | null;
  draft: {
    displayLanguage: DisplayLanguage;
    contentLanguage: ContentLanguage;
  };
  loading: boolean;
  saving: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onDraft: (value: {
    displayLanguage: DisplayLanguage;
    contentLanguage: ContentLanguage;
  }) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();

  if (props.loading) {
    return <p className="text-sm text-muted">{t("languages.loading")}</p>;
  }

  return (
    <Card className="max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-base font-medium">{t("languages.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("languages.description")}</p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="system-display-language"
          className="text-sm font-medium"
        >
          {t("languages.displayLanguage")}
        </label>
        <select
          id="system-display-language"
          value={props.draft.displayLanguage}
          onChange={(event) =>
            props.onDraft({
              ...props.draft,
              displayLanguage: event.target.value as DisplayLanguage,
            })
          }
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        >
          <option value="zh-CN">{t("languages.displayOptions.zh-CN")}</option>
          <option value="en">{t("languages.displayOptions.en")}</option>
        </select>
        <p className="text-xs text-subtle">{t("languages.displayHint")}</p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="system-content-language"
          className="text-sm font-medium"
        >
          {t("languages.contentLanguage")}
        </label>
        <select
          id="system-content-language"
          value={props.draft.contentLanguage}
          onChange={(event) =>
            props.onDraft({
              ...props.draft,
              contentLanguage: event.target.value as ContentLanguage,
            })
          }
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        >
          {Object.values(ContentLanguage).map((language) => (
            <option key={language} value={language}>
              {t(`languages.contentOptions.${language}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-subtle">{t("languages.contentHint")}</p>
      </div>

      {props.settings?.updatedAt && (
        <p className="text-xs text-subtle">
          {t("languages.lastUpdated", {
            name:
              props.settings.updatedBy?.name || t("features.systemOperator"),
            time: new Date(props.settings.updatedAt).toLocaleString(locale),
          })}
        </p>
      )}

      {props.message && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            props.message.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {props.message.text}
        </div>
      )}

      <div className="flex gap-3 border-t border-line pt-4">
        <Button loading={props.saving} onClick={props.onSave}>
          {!props.saving && <Save className="h-4 w-4" />}
          {t("languages.save")}
        </Button>
        <Button
          variant="secondary"
          disabled={props.saving}
          onClick={props.onReset}
        >
          {t("languages.reset")}
        </Button>
      </div>
    </Card>
  );
}

function FeatureSettings(props: {
  features: SystemFeatureDetail[];
  loading: boolean;
  message: string | null;
  videoCapability: VideoCapability | null;
  onChange: (feature: SystemFeatureDetail, enabled: boolean) => void;
  onAudit: (feature: SystemFeatureDetail) => void;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  if (props.loading)
    return <p className="text-sm text-muted">{t("features.loading")}</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
        {t("features.warning")}
      </Card>
      {props.message && (
        <div className="rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand">
          {props.message}
        </div>
      )}
      {Object.entries(GROUP_KEYS).map(([group, groupKey]) => {
        const items = props.features.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
              {t(`features.groups.${groupKey}`)}
            </h2>
            <Card className="divide-y divide-line">
              {items.map((feature) => (
                <div key={feature.key} className="flex items-start gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{feature.label}</h3>
                      <Badge tone={feature.enabled ? "success" : "neutral"}>
                        {feature.enabled ? t("states.open") : t("states.closed")}
                      </Badge>
                      {!feature.configurable && (
                        <span className="inline-flex items-center gap-1 text-xs text-subtle">
                          <LockKeyhole className="h-3 w-3" /> {t("features.protected")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {feature.description}
                    </p>
                    {feature.key === SystemFeature.VIDEO && (
                      <p className="mt-1 text-xs text-subtle">
                        {t("features.videoCapability.label")}
                        {props.videoCapability?.enabled
                          ? t("features.videoCapability.available", {
                              provider:
                                props.videoCapability.provider ??
                                t("features.videoCapability.providerFallback"),
                            })
                          : t("features.videoCapability.unavailable")}
                      </p>
                    )}
                    {feature.updatedAt &&
                      (feature.updatedBy || feature.reason) && (
                        <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-subtle">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              {t("features.lastAction", {
                                state: feature.enabled
                                  ? t("states.open")
                                  : t("states.closed"),
                              })}
                            </span>
                            <span>
                              {t("features.operator", {
                                name:
                                  feature.updatedBy?.name ||
                                  t("features.systemOperator"),
                              })}
                            </span>
                            <span>
                              {t("features.operationTime", {
                                time: new Date(feature.updatedAt).toLocaleString(
                                  locale,
                                ),
                              })}
                            </span>
                          </div>
                          <p className="mt-1">
                            {t("features.operationReason", {
                              reason:
                                feature.reason || t("features.noReason"),
                            })}
                          </p>
                        </div>
                      )}
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onAudit(feature)}
                    className="rounded-lg p-2 text-muted hover:bg-surface-muted"
                    aria-label={t("features.audit.viewAria", { label: feature.label })}
                  >
                    <History className="h-4 w-4" />
                  </button>
                  <Switch
                    enabled={feature.enabled}
                    disabled={!feature.configurable}
                    label={t(
                      feature.enabled
                        ? "features.disableWithLabel"
                        : "features.enableWithLabel",
                      { label: feature.label },
                    )}
                    onClick={() => props.onChange(feature, !feature.enabled)}
                  />
                </div>
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}

function Switch(props: {
  enabled: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        props.enabled ? "bg-brand" : "bg-line-strong"
      }`}
      aria-pressed={props.enabled}
      aria-label={props.label}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-surface transition-transform ${
          props.enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
