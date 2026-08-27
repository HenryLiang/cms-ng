import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContentLanguage, UserRole } from "@cms-ng/shared";

const fetchUser = vi.fn().mockResolvedValue(undefined);
const user = {
  id: "user-id",
  email: "reporter@example.com",
  name: "Reporter",
  role: UserRole.REPORTER,
  department: "News",
  displayLanguage: null,
  preferredLanguage: null,
};

vi.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user, fetchUser }),
}));

vi.mock("@/lib/users-api", () => ({
  updateUser: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/lib/language-settings-api", () => ({
  getLanguageSettings: vi.fn(),
}));

import ProfilePage from "./page";
import { updateUser } from "@/lib/users-api";
import { getLanguageSettings } from "@/lib/language-settings-api";

describe("ProfilePage language preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLanguageSettings).mockResolvedValue({
      displayLanguage: "zh-CN",
      contentLanguage: ContentLanguage.SIMPLIFIED_CHINESE,
      updatedAt: null,
      updatedBy: null,
    });
    vi.mocked(updateUser).mockResolvedValue(user);
  });

  it("saves display and AI content languages independently", async () => {
    render(<ProfilePage />);

    expect(
      await screen.findAllByRole("option", {
        name: "跟随系统默认（简体中文）",
      }),
    ).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("页面文字显示语言"), {
      target: { value: "zh-CN" },
    });
    fireEvent.change(screen.getByLabelText("AI 内容生成语言"), {
      target: { value: ContentLanguage.ENGLISH },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(
        "user-id",
        expect.objectContaining({
          displayLanguage: "zh-CN",
          preferredLanguage: ContentLanguage.ENGLISH,
        }),
      );
    });
  });
});
