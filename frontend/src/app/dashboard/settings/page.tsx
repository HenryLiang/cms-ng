'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getRegistrationStatus, toggleRegistration } from '@/lib/auth-api';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  // 编辑态：保存后才提交到后端
  const [editOpen, setEditOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const data = await getRegistrationStatus();
      setRegistrationOpen(data.registrationOpen);
      setEditOpen(data.registrationOpen);
    } catch {
      setMessage({ type: 'error', text: '加载注册状态失败' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const data = await toggleRegistration(editOpen, reason.trim() || undefined);
      setRegistrationOpen(data.registrationOpen);
      setReason('');
      setMessage({
        type: 'success',
        text: data.registrationOpen ? '已开放注册' : '已关闭注册',
      });
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setMessage({ type: 'error', text: apiMsg || '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="mt-1 text-sm text-zinc-500">管理系统级开关</p>
      </div>

      <div className="max-w-2xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-base font-medium text-zinc-900">注册功能</h2>
          <p className="mt-1 text-sm text-zinc-500">
            控制是否允许新用户注册。关闭后注册页将显示「注册已关闭」提示，已注册用户的登录不受影响。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">当前状态：</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              registrationOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            {registrationOpen ? '开放' : '关闭'}
          </span>
        </div>

        <div className="space-y-4 border-t border-zinc-100 pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditOpen(!editOpen)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                editOpen ? 'bg-zinc-900' : 'bg-zinc-300'
              }`}
              aria-pressed={editOpen}
              aria-label={editOpen ? '开放注册' : '关闭注册'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  editOpen ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-zinc-700">
              {editOpen ? '开放注册' : '关闭注册'}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">切换原因（可选，审计用）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="例如：正式上线前收口 / 维护期间临时关闭"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          {message && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditOpen(registrationOpen);
                setReason('');
                setMessage(null);
              }}
              disabled={saving}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              重置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
