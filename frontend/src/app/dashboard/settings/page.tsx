"use client";

import { useEffect, useState } from "react";
import { History, LockKeyhole, Save, X } from "lucide-react";
import { SystemFeature, UserRole } from "@cms-ng/shared";
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

type SettingsTab = "registration" | "features";
type PendingChange = { feature: SystemFeatureDetail; enabled: boolean };

const GROUP_LABELS = {
  WORKSPACE: "工作区",
  AUTOMATION: "自动化",
  SYSTEM: "系统",
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

  useEffect(() => {
    getRegistrationStatus()
      .then((data) => {
        setRegistrationOpen(data.registrationOpen);
        setEditOpen(data.registrationOpen);
      })
      .catch(() => setMessage({ type: "error", text: "加载注册状态失败" }))
      .finally(() => setLoading(false));
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
          setFeatureMessage(apiMessage(error, "加载功能开放状态失败"));
        }
      })
      .finally(() => {
        if (!cancelled) setFeaturesLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        text: data.registrationOpen ? "已开放注册" : "已关闭注册",
      });
    } catch (error) {
      setMessage({ type: "error", text: apiMessage(error, "保存失败") });
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
        `${updated.label}已${updated.enabled ? "开放" : "关闭"}`,
      );
      setPending(null);
      setChangeReason("");
    } catch (error) {
      setFeatureMessage(apiMessage(error, "更新功能状态失败"));
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
      setFeatureMessage(apiMessage(error, "加载审计记录失败"));
    } finally {
      setAuditLoading(false);
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
      <PageHeader title="系统设置" subtitle="管理系统级开关" />

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
          注册设置
        </button>
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
            功能开放管理
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
          aria-label="确认功能状态变更"
        >
          <Card className="w-full max-w-lg p-6">
            <h2 className="text-base font-semibold">
              {pending.enabled ? "开放" : "关闭"}
              {pending.feature.label}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {pending.enabled
                ? "开放后，符合角色权限的用户将重新看到并可访问该入口。"
                : "关闭后，该入口会从左侧导航隐藏，直接访问也会被拦截。"}
            </p>
            <textarea
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              rows={3}
              placeholder={
                pending.enabled
                  ? "请输入变更原因（可选）"
                  : "请输入关闭原因（必填）"
              }
              className="mt-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setPending(null)}
                disabled={changing}
              >
                取消
              </Button>
              <Button
                variant={pending.enabled ? "primary" : "danger"}
                loading={changing}
                disabled={!pending.enabled && !changeReason.trim()}
                onClick={confirmFeatureChange}
              >
                确认{pending.enabled ? "开放" : "关闭"}
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
          aria-label={`${auditFeature.label}审计记录`}
        >
          <div className="h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-pop">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{auditFeature.label}审计记录</h2>
                <p className="mt-1 text-xs text-muted">
                  最多显示最近 100 条记录
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditFeature(null)}
                aria-label="关闭审计记录"
                className="rounded-lg p-2 text-muted hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {auditLoading ? (
              <p className="text-sm text-muted">加载中…</p>
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted">暂无变更记录</p>
            ) : (
              <div className="space-y-3">
                {audit.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-line p-4"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{item.previousEnabled ? "开放" : "关闭"}</span>
                      <span className="text-subtle">→</span>
                      <span>{item.enabled ? "开放" : "关闭"}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {item.reason || "未填写原因"}
                    </p>
                    <p className="mt-2 text-xs text-subtle">
                      {item.operator?.name || "系统"} ·{" "}
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
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
  return (
    <Card className="max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-base font-medium">注册功能</h2>
        <p className="mt-1 text-sm text-muted">
          控制是否允许新用户注册。关闭后注册页将显示「注册已关闭」提示，已注册用户的登录不受影响。
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">当前状态：</span>
        <Badge tone={props.registrationOpen ? "success" : "neutral"}>
          {props.registrationOpen ? "开放" : "关闭"}
        </Badge>
      </div>
      <div className="space-y-4 border-t border-line pt-4">
        <div className="flex items-center gap-3">
          <Switch
            enabled={props.editOpen}
            label={props.editOpen ? "开放注册" : "关闭注册"}
            onClick={props.onToggle}
          />
          <span className="text-sm font-medium">
            {props.editOpen ? "开放注册" : "关闭注册"}
          </span>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            切换原因（可选，审计用）
          </label>
          <textarea
            value={props.reason}
            onChange={(event) => props.onReason(event.target.value)}
            rows={2}
            placeholder="例如：正式上线前收口 / 维护期间临时关闭"
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
            保存
          </Button>
          <Button
            variant="secondary"
            disabled={props.saving}
            onClick={props.onReset}
          >
            重置
          </Button>
        </div>
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
  if (props.loading)
    return <p className="text-sm text-muted">加载功能状态中…</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
        功能关闭后，左侧一级入口会隐藏，直接调用对应接口也会被拦截；自动发布后台任务和支付回调不受影响。
      </Card>
      {props.message && (
        <div className="rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand">
          {props.message}
        </div>
      )}
      {Object.entries(GROUP_LABELS).map(([group, label]) => {
        const items = props.features.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
              {label}
            </h2>
            <Card className="divide-y divide-line">
              {items.map((feature) => (
                <div key={feature.key} className="flex items-start gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{feature.label}</h3>
                      <Badge tone={feature.enabled ? "success" : "neutral"}>
                        {feature.enabled ? "开放" : "关闭"}
                      </Badge>
                      {!feature.configurable && (
                        <span className="inline-flex items-center gap-1 text-xs text-subtle">
                          <LockKeyhole className="h-3 w-3" /> 受保护
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {feature.description}
                    </p>
                    {feature.key === SystemFeature.VIDEO && (
                      <p className="mt-1 text-xs text-subtle">
                        服务能力：
                        {props.videoCapability?.enabled
                          ? `可用（${props.videoCapability.provider ?? "已配置"}）`
                          : "不可用（未配置 Provider）"}
                      </p>
                    )}
                    {feature.updatedAt &&
                      (feature.updatedBy || feature.reason) && (
                        <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-subtle">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              最近操作：{feature.enabled ? "开放" : "关闭"}
                            </span>
                            <span>
                              操作人：{feature.updatedBy?.name || "系统"}
                            </span>
                            <span>
                              操作时间：
                              {new Date(feature.updatedAt).toLocaleString(
                                "zh-CN",
                              )}
                            </span>
                          </div>
                          <p className="mt-1">
                            操作原因：{feature.reason || "未填写原因"}
                          </p>
                        </div>
                      )}
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onAudit(feature)}
                    className="rounded-lg p-2 text-muted hover:bg-surface-muted"
                    aria-label={`查看${feature.label}审计记录`}
                  >
                    <History className="h-4 w-4" />
                  </button>
                  <Switch
                    enabled={feature.enabled}
                    disabled={!feature.configurable}
                    label={`${feature.enabled ? "关闭" : "开放"}${feature.label}`}
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
