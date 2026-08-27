'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Plus,
  Ban,
  CheckCircle2,
  KeyRound,
  Eye,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  UserRole,
  ContentLanguage,
} from '@cms-ng/shared';
import { User } from '@/types/auth';
import {
  getUsers,
  createUser,
  updateUserStatus,
  resetUserPassword,
  getUserConsumption,
  type UserConsumption,
} from '@/lib/users-api';
import {
  getTransactionTypeLabel,
  getTransactionCategoryLabel,
} from '@/lib/transaction-labels';
import { Button, Card, PageHeader, Badge, Input } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';

// 角色/语言存词典 key(roles.* / languages.*),渲染处经 t() 解析
const roleLabelKeys: Record<UserRole, string> = {
  [UserRole.REPORTER]: 'reporter',
  [UserRole.EDITOR]: 'editor',
  [UserRole.ADMIN]: 'admin',
  [UserRole.SUPER_ADMIN]: 'superAdmin',
};

const languageLabelKeys: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: 'simplifiedChinese',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: 'traditionalChineseHk',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: 'traditionalChineseCantonese',
  [ContentLanguage.ENGLISH]: 'english',
};

function formatDate(dateStr: string | Date, locale: string): string {
  return new Date(dateStr).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const currentUser = useAuthStore((state) => state.user);
  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 新建账户弹窗
  const [createOpen, setCreateOpen] = useState(false);
  // 一次性密码展示（建号 / 重置密码共用）
  const [passwordResult, setPasswordResult] = useState<{ password: string; title: string } | null>(null);
  // 重置密码确认
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [resetting, setResetting] = useState(false);
  // 消费抽屉
  const [drawerUser, setDrawerUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        if (!cancelled) setMessage({ type: 'error', text: t('list.loadFailed') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount,t 仅为词典引用刻意不入 deps
  }, []);

  async function handleToggleStatus(user: User) {
    const next = !user.isActive;
    try {
      await updateUserStatus(user.id, next);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
      setMessage({ type: 'success', text: next ? t('list.enableSuccess') : t('list.disableSuccess') });
    } catch {
      setMessage({ type: 'error', text: tCommon('feedback.failed') });
    }
  }

  async function handleConfirmReset() {
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { password } = await resetUserPassword(confirmReset.id);
      setPasswordResult({ password, title: t('resetPwd.successTitle') });
      setConfirmReset(null);
    } catch {
      setMessage({ type: 'error', text: t('resetPwd.failed') });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="h-full p-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('createButton')}
          </Button>
        }
      />

      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">{t('list.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">{t('list.columns.name')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.email')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.role')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.department')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.status')}</th>
                <th className="px-6 py-3 font-medium text-right">{t('list.columns.balance')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.createdAt')}</th>
                <th className="px-6 py-3 font-medium">{t('list.columns.lastLogin')}</th>
                <th className="px-6 py-3 font-medium text-right">{t('list.columns.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className="transition hover:bg-surface-muted/50">
                  <td className="px-6 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-6 py-3 text-muted">{u.email}</td>
                  <td className="px-6 py-3 text-muted">
                    {u.role in roleLabelKeys ? t(`roles.${roleLabelKeys[u.role]}`) : u.role}
                  </td>
                  <td className="px-6 py-3 text-muted">{u.department || '-'}</td>
                  <td className="px-6 py-3">
                    {u.isActive ? (
                      <Badge tone="success">{t('list.statusActive')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('list.statusInactive')}</Badge>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-muted tnum">
                    ¥{Number(u.balance ?? 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-subtle tnum">
                    {u.createdAt ? formatDate(u.createdAt, locale) : '-'}
                  </td>
                  <td className="px-6 py-3 text-subtle tnum">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt, locale) : t('list.neverLoggedIn')}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== UserRole.SUPER_ADMIN || isSuperAdmin ? (
                        u.isActive ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleToggleStatus(u)}
                        >
                          <Ban className="h-3 w-3" />
                          {t('list.actions.disable')}
                        </Button>
                        ) : (
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {t('list.actions.enable')}
                        </button>
                        )
                      ) : null}
                      {(u.role !== UserRole.SUPER_ADMIN || isSuperAdmin) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmReset(u)}
                        >
                          <KeyRound className="h-3 w-3" />
                          {t('list.actions.resetPassword')}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDrawerUser(u)}
                      >
                        <Eye className="h-3 w-3" />
                        {t('list.actions.consumption')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {createOpen && (
        <CreateAccountModal
          canCreateSuperAdmin={isSuperAdmin}
          onClose={() => setCreateOpen(false)}
          onCreated={(user, initialPassword) => {
            setUsers((prev) => [user, ...prev]);
            setCreateOpen(false);
            setPasswordResult({ password: initialPassword, title: t('createForm.successTitle') });
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title={t('resetPwd.confirmTitle')}
          message={t('resetPwd.confirmMessage', { name: confirmReset.name, email: confirmReset.email })}
          confirmText={t('resetPwd.confirmAction')}
          loading={resetting}
          onCancel={() => setConfirmReset(null)}
          onConfirm={handleConfirmReset}
        />
      )}

      {passwordResult && (
        <PasswordResultModal
          title={passwordResult.title}
          password={passwordResult.password}
          onClose={() => setPasswordResult(null)}
        />
      )}

      {drawerUser && (
        <ConsumptionDrawer key={drawerUser.id} user={drawerUser} onClose={() => setDrawerUser(null)} />
      )}
    </div>
  );
}

// ─── 新建账户弹窗 ───

function CreateAccountModal({
  onClose,
  onCreated,
  canCreateSuperAdmin,
}: {
  onClose: () => void;
  onCreated: (user: User, initialPassword: string) => void;
  canCreateSuperAdmin: boolean;
}) {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: UserRole.REPORTER as UserRole,
    department: '',
    preferredLanguage: '' as ContentLanguage | '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { user, initialPassword } = await createUser({
        email: form.email,
        name: form.name,
        role: form.role,
        department: form.department || undefined,
        preferredLanguage: form.preferredLanguage || undefined,
      });
      onCreated(user, initialPassword);
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(apiMsg || t('createForm.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={t('createForm.title')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('createForm.email')} htmlFor="create-email">
          <Input
            id="create-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="user@example.com"
          />
        </Field>
        <Field label={t('createForm.name')} htmlFor="create-name">
          <Input
            id="create-name"
            type="text"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label={t('createForm.role')} htmlFor="create-role">
          <select
            id="create-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className={selectClass}
          >
            <option value={UserRole.REPORTER}>{t('roles.reporter')}</option>
            <option value={UserRole.EDITOR}>{t('roles.editor')}</option>
            <option value={UserRole.ADMIN}>{t('roles.admin')}</option>
            {canCreateSuperAdmin && (
              <option value={UserRole.SUPER_ADMIN}>{t('roles.superAdmin')}</option>
            )}
          </select>
        </Field>
        <Field label={t('createForm.department')} htmlFor="create-department">
          <Input
            id="create-department"
            type="text"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
        </Field>
        <Field label={t('createForm.language')} htmlFor="create-lang">
          <select
            id="create-lang"
            value={form.preferredLanguage}
            onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as ContentLanguage })}
            className={selectClass}
          >
            <option value="">{t('createForm.systemDefaultLanguage')}</option>
            {Object.entries(languageLabelKeys).map(([value, labelKey]) => (
              <option key={value} value={value}>
                {t(`languages.${labelKey}`)}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-muted">
          {t('createForm.initialPasswordNote')}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t('createForm.submit')}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── 一次性密码展示 ───

function PasswordResultModal({
  title,
  password,
  onClose,
}: {
  title: string;
  password: string;
  onClose: () => void;
}) {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('passwordResult.notice')}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted p-3">
          <code className="flex-1 font-mono text-lg tracking-wider text-foreground">{password}</code>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                {tCommon('actions.copied')}
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                {tCommon('actions.copy')}
              </>
            )}
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t('passwordResult.saved')}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── 确认对话框 ───

function ConfirmDialog({
  title,
  message,
  confirmText,
  loading,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmText: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tCommon = useTranslations('common');
  return (
    <ModalShell title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {tCommon('actions.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── 消费抽屉 ───

function ConsumptionDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useTranslations('accounts');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [data, setData] = useState<UserConsumption | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;
    getUserConsumption(user.id, page, pageSize)
      .then((res) => {
        if (!cancelled) {
          setError(null);
          setData(res);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t('consumption.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-change,t 仅为词典引用刻意不入 deps
  }, [user.id, page]);

  const totalPages = data ? Math.ceil(data.meta.total / pageSize) : 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[480px] flex-col border-l border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t('consumption.title')}</h2>
            <p className="text-xs text-muted">{t('consumption.userLine', { name: user.name, email: user.email })}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-red-600">{error}</p>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <Stat label={t('consumption.currentBalance')} value={`¥${Number(data.user.balance ?? 0).toFixed(2)}`} />
                <Stat label={t('consumption.totalSpent')} value={`¥${data.summary.totalSpent.toFixed(2)}`} tone="red" />
                <Stat label={t('consumption.totalTopUp')} value={`¥${data.summary.totalTopUp.toFixed(2)}`} tone="green" />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">{t('consumption.byCategory')}</h3>
                <div className="space-y-2">
                  {Object.entries(data.summary.byCategory).length === 0 ? (
                    <p className="text-xs text-subtle">{t('consumption.noConsumption')}</p>
                  ) : (
                    Object.entries(data.summary.byCategory).map(([cat, amount]) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
                      >
                        <span className="text-muted">{getTransactionCategoryLabel(cat)}</span>
                        <span className="font-medium text-foreground tnum">¥{amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">{t('consumption.recentTransactions')}</h3>
                {data.recentTransactions.length === 0 ? (
                  <p className="text-xs text-subtle">{t('consumption.noTransactions')}</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{tx.description}</p>
                          <p className="text-xs text-subtle">
                            {getTransactionTypeLabel(tx.type)} · {formatDate(tx.createdAt, locale)}
                          </p>
                        </div>
                        <span
                          className={`ml-2 shrink-0 font-medium tnum ${
                            tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {tx.amount >= 0 ? '+' : '-'}¥{Math.abs(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {data && data.meta.total > pageSize && (
          <div className="flex items-center justify-between border-t border-line px-6 py-3">
            <p className="text-xs text-muted tnum">
              {t('consumption.pagination', { total: data.meta.total, page, totalPages })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3 w-3" />
                {tCommon('pagination.prev')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {tCommon('pagination.next')}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 小部件 ───

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'green';
}) {
  const color =
    tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-foreground';
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-base font-semibold tnum ${color}`}>{value}</p>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const selectClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
