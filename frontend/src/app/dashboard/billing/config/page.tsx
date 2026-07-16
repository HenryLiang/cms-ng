'use client';

import { useState, useEffect } from 'react';
import { Save, Pencil, X } from 'lucide-react';
import {
  getBillingConfigs,
  updateBillingConfig,
  type BillingConfig,
} from '@/lib/billing-api';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';

const categoryLabels: Record<string, string> = {
  AI: 'AI 服务',
  PUBLISHING: '发布服务',
  OTHER: '其他',
};

export default function BillingConfigPage() {
  const [configs, setConfigs] = useState<BillingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const data = await getBillingConfigs();
      setConfigs(data);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(config: BillingConfig) {
    setEditingKey(config.itemKey);
    setEditPrice(String(config.unitPrice));
    setEditActive(config.isActive);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditPrice('');
    setEditActive(true);
  }

  async function handleSave(itemKey: string) {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) {
      alert('请输入有效的单价');
      return;
    }

    setSaving(true);
    try {
      await updateBillingConfig(itemKey, {
        unitPrice: price,
        isActive: editActive,
      });
      setEditingKey(null);
      await loadConfigs();
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
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
      <PageHeader
        title="计费配置"
        subtitle="管理各服务项目的计费单价和启用状态"
      />

      <Card>
        {configs.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">名称</th>
                <th className="px-6 py-3 font-medium">类别</th>
                <th className="px-6 py-3 font-medium">计费单位</th>
                <th className="px-6 py-3 font-medium text-right">单价 (¥)</th>
                <th className="px-6 py-3 font-medium text-center">状态</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {configs.map((config) => {
                const isEditing = editingKey === config.itemKey;
                return (
                  <tr key={config.id} className="transition hover:bg-surface-muted/50">
                    <td className="px-6 py-3 font-medium text-foreground">
                      {config.itemName}
                    </td>
                    <td className="px-6 py-3">
                      <Badge tone="neutral">
                        {categoryLabels[config.category] || config.category}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-muted">{config.unit}</td>
                    <td className="tnum px-6 py-3 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 text-right"
                          autoFocus
                        />
                      ) : (
                        <span className="tnum font-mono text-foreground">
                          ¥{config.unitPrice.toFixed(4)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {isEditing ? (
                        <button
                          onClick={() => setEditActive(!editActive)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            editActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-surface-muted text-muted hover:bg-surface-muted'
                          }`}
                        >
                          {editActive ? '启用' : '禁用'}
                        </button>
                      ) : (
                        <Badge tone={config.isActive ? 'success' : 'neutral'}>
                          {config.isActive ? '启用' : '禁用'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            loading={saving}
                            onClick={() => handleSave(config.itemKey)}
                          >
                            <Save className="h-3 w-3" />
                            保存
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(config)}
                          className="ml-auto"
                        >
                          <Pencil className="h-3 w-3" />
                          编辑
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
