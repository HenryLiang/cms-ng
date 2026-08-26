'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/auth-store';
import { updateUser, changePassword } from '@/lib/users-api';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  UserRole,
} from '@cms-ng/shared';
import { Save, Check, KeyRound } from 'lucide-react';
import { Button, Card, PageHeader, Input } from '@/components/ui';

// 角色/语言存词典 key(roles.* / languages.*),渲染处经 t() 解析
const languageLabelKeys: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: 'simplifiedChinese',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: 'traditionalChineseHk',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: 'traditionalChineseCantonese',
  [ContentLanguage.ENGLISH]: 'english',
};

const roleLabelKeys: Record<UserRole, string> = {
  [UserRole.REPORTER]: 'reporter',
  [UserRole.EDITOR]: 'editor',
  [UserRole.ADMIN]: 'admin',
  [UserRole.SUPER_ADMIN]: 'superAdmin',
};

export default function ProfilePage() {
  const t = useTranslations('profile');
  const { user, fetchUser } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    department: user?.department || '',
    preferredLanguage: user?.preferredLanguage || DEFAULT_CONTENT_LANGUAGE,
  });

  // 修改密码
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      alert(t('form.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);
    if (pwdForm.newPassword !== pwdForm.confirm) {
      setPwdMessage({ type: 'error', text: t('passwordSection.mismatch') });
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      setPwdMessage({ type: 'error', text: t('passwordSection.tooShort') });
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(pwdForm.currentPassword, pwdForm.newPassword);
      setPwdForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPwdMessage({ type: 'success', text: t('passwordSection.success') });
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setPwdMessage({ type: 'error', text: apiMsg || t('passwordSection.failed') });
    } finally {
      setPwdSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader title={t('title')} className="mb-8" />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
              {t('form.name')}
            </label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
              {t('form.email')}
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="w-full rounded-lg border border-line bg-surface-muted px-4 py-2.5 text-sm text-muted"
            />
          </div>

          {/* Role (read-only) */}
          <div>
            <label htmlFor="role" className="mb-2 block text-sm font-medium text-foreground">
              {t('form.role')}
            </label>
            <input
              id="role"
              type="text"
              value={
                user.role in roleLabelKeys ? t(`roles.${roleLabelKeys[user.role]}`) : user.role
              }
              disabled
              className="w-full rounded-lg border border-line bg-surface-muted px-4 py-2.5 text-sm text-muted"
            />
          </div>

          {/* Department */}
          <div>
            <label htmlFor="department" className="mb-2 block text-sm font-medium text-foreground">
              {t('form.department')}
            </label>
            <Input
              id="department"
              type="text"
              value={formData.department}
              onChange={(e) => handleChange('department', e.target.value)}
              placeholder={t('form.departmentPlaceholder')}
            />
          </div>

          {/* Preferred Language */}
          <div>
            <label htmlFor="preferredLanguage" className="mb-2 block text-sm font-medium text-foreground">
              {t('form.language')}
            </label>
            <select
              id="preferredLanguage"
              value={formData.preferredLanguage}
              onChange={(e) => handleChange('preferredLanguage', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {Object.entries(languageLabelKeys).map(([value, labelKey]) => (
                <option key={value} value={value}>
                  {t(`languages.${labelKey}`)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted">
              {t('form.languageHint')}
            </p>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-4">
            <Button type="submit" variant="primary" loading={isSaving}>
              {isSaving ? (
                t('form.saving')
              ) : saveSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  {t('form.saved')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('form.submit')}
                </>
              )}
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-600">{t('form.savedHint')}</span>
            )}
          </div>
        </form>

        {/* 修改密码 */}
        <div className="mt-10 border-t border-line pt-8">
          <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-foreground">
            <KeyRound className="h-5 w-5" />
            {t('passwordSection.title')}
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-6">
            <div>
              <label htmlFor="currentPassword" className="mb-2 block text-sm font-medium text-foreground">
                {t('passwordSection.current')}
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={pwdForm.currentPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="mb-2 block text-sm font-medium text-foreground">
                {t('passwordSection.new')}
              </label>
              <Input
                id="newPassword"
                type="password"
                value={pwdForm.newPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                minLength={6}
                required
              />
              <p className="mt-1.5 text-xs text-muted">{t('passwordSection.hint')}</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-foreground">
                {t('passwordSection.confirm')}
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
                minLength={6}
                required
              />
            </div>
            {pwdMessage && (
              <p className={`text-sm ${pwdMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {pwdMessage.text}
              </p>
            )}
            <div className="pt-2">
              <Button type="submit" variant="primary" loading={pwdSaving}>
                {pwdSaving ? (
                  t('passwordSection.changing')
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    {t('passwordSection.submit')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
