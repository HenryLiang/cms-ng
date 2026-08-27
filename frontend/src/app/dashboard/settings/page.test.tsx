import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SystemFeature, UserRole } from "@cms-ng/shared";

let mockRole = UserRole.ADMIN;

vi.mock("@/lib/auth-api", () => ({
  getRegistrationStatus: vi.fn(),
  toggleRegistration: vi.fn(),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: {
        id: "operator-id",
        role: mockRole,
        displayLanguage: "zh-CN",
      },
    }),
}));

vi.mock("@/lib/system-features-api", () => ({
  getSystemFeatureDetails: vi.fn(),
  updateSystemFeature: vi.fn(),
  getSystemFeatureAudit: vi.fn(),
}));

vi.mock("@/lib/video-api", () => ({
  getVideoCapability: vi.fn().mockResolvedValue({
    enabled: true,
    provider: "jimeng",
  }),
}));

vi.mock("@/lib/language-settings-api", () => ({
  getLanguageSettings: vi.fn(),
  updateLanguageSettings: vi.fn(),
}));

import SettingsPage from "./page";
import { getRegistrationStatus, toggleRegistration } from "@/lib/auth-api";
import {
  getSystemFeatureDetails,
  updateSystemFeature,
} from "@/lib/system-features-api";
import {
  getLanguageSettings,
  updateLanguageSettings,
} from "@/lib/language-settings-api";

beforeEach(() => {
  vi.clearAllMocks();
  mockRole = UserRole.ADMIN;
  vi.mocked(getLanguageSettings).mockResolvedValue({
    displayLanguage: "zh-CN",
    contentLanguage: "SIMPLIFIED_CHINESE" as never,
    updatedAt: null,
    updatedBy: null,
  });
});

describe("SettingsPage - registration switch", () => {
  it("renders the current open state on mount", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });

    render(<SettingsPage />);

    expect(await screen.findByText("系统设置")).toBeInTheDocument();
    expect(screen.getByText("开放")).toBeInTheDocument();
    expect(screen.queryByText("关闭")).not.toBeInTheDocument();
  });

  it("renders the current closed state on mount", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: false,
    });

    render(<SettingsPage />);

    expect(await screen.findByText("关闭")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关闭注册" }),
    ).toBeInTheDocument();
  });

  it("toggles to closed and saves with a reason", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });
    vi.mocked(toggleRegistration).mockResolvedValue({
      registrationOpen: false,
    });

    render(<SettingsPage />);

    const toggle = await screen.findByRole("button", { name: "开放注册" });
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "关闭注册" });

    fireEvent.change(screen.getByPlaceholderText(/正式上线前收口/), {
      target: { value: "维护收口" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(toggleRegistration).toHaveBeenCalledWith(false, "维护收口");
    });
    expect(await screen.findByText("已关闭注册")).toBeInTheDocument();
  });

  it("shows feature management only to SUPER_ADMIN", async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });

    const view = render(<SettingsPage />);
    await screen.findByText("系统设置");
    expect(
      screen.queryByRole("button", { name: "功能开放管理" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "语言默认值" }),
    ).not.toBeInTheDocument();

    view.unmount();
    mockRole = UserRole.SUPER_ADMIN;
    vi.mocked(getSystemFeatureDetails).mockResolvedValue([]);
    render(<SettingsPage />);

    expect(
      await screen.findByRole("button", { name: "功能开放管理" }),
    ).toBeInTheDocument();
  });

  it("allows a SUPER_ADMIN to update both system language defaults", async () => {
    mockRole = UserRole.SUPER_ADMIN;
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });
    vi.mocked(getSystemFeatureDetails).mockResolvedValue([]);
    vi.mocked(updateLanguageSettings).mockResolvedValue({
      displayLanguage: "en",
      contentLanguage: "ENGLISH" as never,
      updatedAt: "2026-08-27T01:00:00.000Z",
      updatedBy: { id: "operator-id", name: "Root", email: "root@example.com" },
    });

    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "语言默认值" }));

    fireEvent.change(screen.getByLabelText("页面文字显示语言"), {
      target: { value: "en" },
    });
    fireEvent.change(screen.getByLabelText("AI 内容生成语言"), {
      target: { value: "ENGLISH" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存语言默认值" }));

    await waitFor(() => {
      expect(updateLanguageSettings).toHaveBeenCalledWith({
        displayLanguage: "en",
        contentLanguage: "ENGLISH",
      });
    });
  });

  it("requires a reason before closing a feature", async () => {
    mockRole = UserRole.SUPER_ADMIN;
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });
    vi.mocked(getSystemFeatureDetails).mockResolvedValue([
      {
        key: SystemFeature.MEDIA,
        label: "媒体库",
        description: "图片素材管理",
        group: "WORKSPACE",
        configurable: true,
        roles: [UserRole.ADMIN],
        enabled: true,
        reason: null,
        updatedAt: null,
        updatedBy: null,
      },
    ]);
    vi.mocked(updateSystemFeature).mockResolvedValue({
      ...(await vi.mocked(getSystemFeatureDetails)())[0],
      enabled: false,
      reason: "系统维护",
    });

    render(<SettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "功能开放管理" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "关闭媒体库" }));

    const confirm = screen.getByRole("button", { name: "确认关闭" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("请输入关闭原因（必填）"), {
      target: { value: "系统维护" },
    });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(updateSystemFeature).toHaveBeenCalledWith(
        SystemFeature.MEDIA,
        false,
        "系统维护",
      );
    });
  });

  it("shows the latest action, operator, time, and reason for each changed feature", async () => {
    mockRole = UserRole.SUPER_ADMIN;
    vi.mocked(getRegistrationStatus).mockResolvedValue({
      registrationOpen: true,
    });
    vi.mocked(getSystemFeatureDetails).mockResolvedValue([
      {
        key: SystemFeature.MEDIA,
        label: "媒体库",
        description: "图片素材管理",
        group: "WORKSPACE",
        configurable: true,
        roles: [UserRole.ADMIN],
        enabled: true,
        reason: "维护完成",
        updatedAt: "2026-08-08T12:00:00.000Z",
        updatedBy: {
          id: "super-admin-id",
          name: "Root",
          email: "root@example.com",
        },
      },
    ]);

    render(<SettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "功能开放管理" }),
    );

    expect(await screen.findByText("最近操作：开放")).toBeInTheDocument();
    expect(screen.getByText(/操作人：Root/)).toBeInTheDocument();
    expect(screen.getByText(/操作时间：/)).toBeInTheDocument();
    expect(screen.getByText("操作原因：维护完成")).toBeInTheDocument();
  });
});
