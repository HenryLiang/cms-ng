'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { updateUser } from '@/lib/users-api';
import { ContentLanguage } from '@cms-ng/shared';
import { UserRole } from '@cms-ng/shared';
import { Save, Check } from 'lucide-react';

const languageLabels: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: '简体中文',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: '繁体中文（香港）',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: '繁体中文（粤语）',
  [ContentLanguage.ENGLISH]: 'English',
};

const roleLabels: Record<UserRole, string> = {
  [UserRole.REPORTER]: '记者',
  [UserRole.EDITOR]: '编辑',
  [UserRole.ADMIN]: '管理员',
};

export default function ProfilePage() {
  const { user, fetchUser } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    department: user?.department || '',
    preferredLanguage: user?.preferredLanguage || ContentLanguage.TRADITIONAL_CHINESE_HK,
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateUser(user.id, {
        name: formData.name,
        department: formData.department || undefined,
        preferredLanguage: formData.preferredLanguage,
      });
      await fetchUser();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900">个人资料</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-zinc-700">
            姓名
          </label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            required
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-700">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500"
          />
        </div>

        {/* Role (read-only) */}
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium text-zinc-700">
            角色
          </label>
          <input
            id="role"
            type="text"
            value={roleLabels[user.role] || user.role}
            disabled
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500"
          />
        </div>

        {/* Department */}
        <div>
          <label htmlFor="department" className="mb-2 block text-sm font-medium text-zinc-700">
            部门
          </label>
          <input
            id="department"
            type="text"
            value={formData.department}
            onChange={(e) => handleChange('department', e.target.value)}
            placeholder="请输入部门名称"
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        {/* Preferred Language */}
        <div>
          <label htmlFor="preferredLanguage" className="mb-2 block text-sm font-medium text-zinc-700">
            语言偏好
          </label>
          <select
            id="preferredLanguage"
            value={formData.preferredLanguage}
            onChange={(e) => handleChange('preferredLanguage', e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            {Object.entries(languageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            该设置将用于 AI 内容生成和稿件创作的默认语言
          </p>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-white" />
                保存中...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="h-4 w-4" />
                已保存
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                保存设置
              </>
            )}
          </button>
          {saveSuccess && (
            <span className="text-sm text-green-600">设置已保存</span>
          )}
        </div>
      </form>
    </div>
  );
}
