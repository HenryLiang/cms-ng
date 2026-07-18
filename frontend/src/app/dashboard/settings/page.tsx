'use client';

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { getRegistrationStatus, toggleRegistration } from '@/lib/auth-api';
import { Button, Card, PageHeader, Badge } from '@/components/ui';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  // 编辑态：保存后才提交到后端
  const [editOpen, setEditOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount:loadStatus 内 setState 同步触发,React 19 规则对此过严
    loadStatus();
  }, []);

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <PageHeader title="系统设置" subtitle="管理系统级开关" />

      <Card className="max-w-2xl space-y-6 p-6">
        <div>
          <h2 className="text-base font-medium text-foreground">注册功能</h2>
          <p className="mt-1 text-sm text-muted">
            控制是否允许新用户注册。关闭后注册页将显示「注册已关闭」提示，已注册用户的登录不受影响。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">当前状态：</span>
          {registrationOpen ? (
            <Badge tone="success">开放</Badge>
          ) : (
            <Badge tone="neutral">关闭</Badge>
          )}
        </div>

        <div className="space-y-4 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditOpen(!editOpen)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                editOpen ? 'bg-brand' : 'bg-line-strong'
              }`}
              aria-pressed={editOpen}
              aria-label={editOpen ? '开放注册' : '关闭注册'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                  editOpen ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-foreground">
              {editOpen ? '开放注册' : '关闭注册'}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">切换原因（可选，审计用）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="例如：正式上线前收口 / 维护期间临时关闭"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
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
            <Button type="button" variant="primary" loading={saving} onClick={handleSave}>
              {!saving && <Save className="h-4 w-4" />}
              保存
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setEditOpen(registrationOpen);
                setReason('');
                setMessage(null);
              }}
            >
              重置
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
