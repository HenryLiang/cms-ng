'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
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
import { UserRole, ContentLanguage } from '@cms-ng/shared';
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
  transactionTypeLabels,
  transactionCategoryLabels,
} from '@/lib/transaction-labels';

const roleLabels: Record<UserRole, string> = {
  [UserRole.REPORTER]: '记者',
  [UserRole.EDITOR]: '编辑',
  [UserRole.ADMIN]: '管理员',
};

const languageLabels: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: '简体中文',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: '繁体中文（香港）',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: '繁体中文（粤语）',
  [ContentLanguage.ENGLISH]: 'English',
};

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AccountsPage() {
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
        if (!cancelled) setMessage({ type: 'error', text: '加载账户列表失败' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleStatus(user: User) {
    const next = !user.isActive;
    try {
      await updateUserStatus(user.id, next);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
      setMessage({ type: 'success', text: next ? '已启用账户' : '已禁用账户' });
    } catch {
      setMessage({ type: 'error', text: '操作失败' });
    }
  }

  async function handleConfirmReset() {
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { password } = await resetUserPassword(confirmReset.id);
      setPasswordResult({ password, title: '重置密码成功' });
      setConfirmReset(null);
    } catch {
      setMessage({ type: 'error', text: '重置密码失败' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="h-full p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">账号管理</h1>
          <p className="mt-1 text-sm text-zinc-500">创建账户、启用/禁用账户、查看账户消费情况</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          新建账户
        </button>
      </div>

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

      <div className="rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-500">暂无账户</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-6 py-3 font-medium">姓名</th>
                <th className="px-6 py-3 font-medium">邮箱</th>
                <th className="px-6 py-3 font-medium">角色</th>
                <th className="px-6 py-3 font-medium">部门</th>
                <th className="px-6 py-3 font-medium">状态</th>
                <th className="px-6 py-3 font-medium text-right">余额</th>
                <th className="px-6 py-3 font-medium">创建时间</th>
                <th className="px-6 py-3 font-medium">最后登录</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-6 py-3 font-medium text-zinc-900">{u.name}</td>
                  <td className="px-6 py-3 text-zinc-600">{u.email}</td>
                  <td className="px-6 py-3 text-zinc-600">{roleLabels[u.role] || u.role}</td>
                  <td className="px-6 py-3 text-zinc-600">{u.department || '-'}</td>
                  <td className="px-6 py-3">
                    {u.isActive ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        启用
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        禁用
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-zinc-600">
                    ¥{Number(u.balance ?? 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {u.createdAt ? formatDate(u.createdAt) : '-'}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : '从未登录'}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          u.isActive
                            ? 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {u.isActive ? (
                          <>
                            <Ban className="h-3 w-3" />
                            禁用
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            启用
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmReset(u)}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <KeyRound className="h-3 w-3" />
                        重置密码
                      </button>
                      <button
                        onClick={() => setDrawerUser(u)}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <Eye className="h-3 w-3" />
                        消费
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <CreateAccountModal
          onClose={() => setCreateOpen(false)}
          onCreated={(user, initialPassword) => {
            setUsers((prev) => [user, ...prev]);
            setCreateOpen(false);
            setPasswordResult({ password: initialPassword, title: '账户创建成功' });
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="重置密码"
          message={`确认为 ${confirmReset.name}（${confirmReset.email}）重置密码？将生成新的随机密码，原密码立即失效。`}
          confirmText="重置"
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
}: {
  onClose: () => void;
  onCreated: (user: User, initialPassword: string) => void;
}) {
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: UserRole.REPORTER as UserRole,
    department: '',
    preferredLanguage: ContentLanguage.TRADITIONAL_CHINESE_HK as ContentLanguage,
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
        preferredLanguage: form.preferredLanguage,
      });
      onCreated(user, initialPassword);
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(apiMsg || '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="新建账户" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="邮箱" htmlFor="create-email">
          <input
            id="create-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
            placeholder="user@example.com"
          />
        </Field>
        <Field label="姓名" htmlFor="create-name">
          <input
            id="create-name"
            type="text"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="角色" htmlFor="create-role">
          <select
            id="create-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className={inputClass}
          >
            <option value={UserRole.REPORTER}>记者</option>
            <option value={UserRole.EDITOR}>编辑</option>
            <option value={UserRole.ADMIN}>管理员</option>
          </select>
        </Field>
        <Field label="部门（可选）" htmlFor="create-department">
          <input
            id="create-department"
            type="text"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="语言偏好" htmlFor="create-lang">
          <select
            id="create-lang"
            value={form.preferredLanguage}
            onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as ContentLanguage })}
            className={inputClass}
          >
            {Object.entries(languageLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-xs text-zinc-500">
          创建后将生成一个随机初始密码，仅显示一次，请立即保存并交给用户。
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            创建
          </button>
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
          该密码仅显示一次，请立即复制保存。关闭后无法再次查看。
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <code className="flex-1 font-mono text-lg tracking-wider text-zinc-900">{password}</code>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                复制
              </>
            )}
          </button>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            我已保存
          </button>
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
  return (
    <ModalShell title={title} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── 消费抽屉 ───

function ConsumptionDrawer({ user, onClose }: { user: User; onClose: () => void }) {
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
        if (!cancelled) setError('加载消费数据失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, page]);

  const totalPages = data ? Math.ceil(data.meta.total / pageSize) : 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[480px] flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">账户消费</h2>
            <p className="text-xs text-zinc-500">{user.name}（{user.email}）</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-red-600">{error}</p>
          ) : data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="当前余额" value={`¥${Number(data.user.balance ?? 0).toFixed(2)}`} />
                <Stat label="累计消费" value={`¥${data.summary.totalSpent.toFixed(2)}`} tone="red" />
                <Stat label="累计充值" value={`¥${data.summary.totalTopUp.toFixed(2)}`} tone="green" />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-700">按类目分布</h3>
                <div className="space-y-2">
                  {Object.entries(data.summary.byCategory).length === 0 ? (
                    <p className="text-xs text-zinc-400">暂无消费</p>
                  ) : (
                    Object.entries(data.summary.byCategory).map(([cat, amount]) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      >
                        <span className="text-zinc-600">{transactionCategoryLabels[cat] || cat}</span>
                        <span className="font-medium text-zinc-900">¥{amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-700">最近流水</h3>
                {data.recentTransactions.length === 0 ? (
                  <p className="text-xs text-zinc-400">暂无交易记录</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-zinc-700">{tx.description}</p>
                          <p className="text-xs text-zinc-400">
                            {transactionTypeLabels[tx.type] || tx.type} · {formatDate(tx.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`ml-2 shrink-0 font-medium ${
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
          <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-3">
            <p className="text-xs text-zinc-500">
              共 {data.meta.total} 条，第 {page}/{totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" />
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                下一页
                <ChevronRight className="h-3 w-3" />
              </button>
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
    tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : 'text-zinc-900';
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${color}`}>{value}</p>
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
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
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
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900';
