'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, Pencil, X, Check } from 'lucide-react';
import {
  getBillingConfigs,
  updateBillingConfig,
  type BillingConfig,
} from '@/lib/billing-api';

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
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">计费配置</h1>
        <p className="mt-1 text-sm text-zinc-500">管理各服务项目的计费单价和启用状态</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        {configs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-500">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-6 py-3 font-medium">名称</th>
                <th className="px-6 py-3 font-medium">类别</th>
                <th className="px-6 py-3 font-medium">计费单位</th>
                <th className="px-6 py-3 font-medium text-right">单价 (¥)</th>
                <th className="px-6 py-3 font-medium text-center">状态</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => {
                const isEditing = editingKey === config.itemKey;
                return (
                  <tr key={config.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-6 py-3 font-medium text-zinc-900">
                      {config.itemName}
                    </td>
                    <td className="px-6 py-3">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {categoryLabels[config.category] || config.category}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-zinc-500">{config.unit}</td>
                    <td className="px-6 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 rounded border border-zinc-300 px-2 py-1 text-right text-sm outline-none focus:border-zinc-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono text-zinc-900">
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
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}
                        >
                          {editActive ? '启用' : '禁用'}
                        </button>
                      ) : (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            config.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {config.isActive ? '启用' : '禁用'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSave(config.itemKey)}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {saving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            <X className="h-3 w-3" />
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(config)}
                          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ml-auto"
                        >
                          <Pencil className="h-3 w-3" />
                          编辑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
