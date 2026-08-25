'use client';

import { useState, useEffect } from 'react';
import { Save, Pencil, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  getBillingConfigs,
  updateBillingConfig,
  type BillingConfig,
} from '@/lib/billing-api';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';

// BillingCategory -> billing.shared.categoryLabels 词典 key(未知类别回退显示原始枚举值)
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  AI: 'shared.categoryLabels.AI',
  PUBLISHING: 'shared.categoryLabels.PUBLISHING',
  OTHER: 'shared.categoryLabels.OTHER',
};

export default function BillingConfigPage() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
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
      alert(t('config.invalidPrice'));
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
      alert(
        t('config.saveFailed', {
          message: err instanceof Error ? err.message : t('shared.unknownError'),
        }),
      );
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
        title={t('config.title')}
        subtitle={t('config.subtitle')}
      />

      <Card>
        {configs.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">{tCommon('state.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">{t('shared.table.name')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.category')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.unit')}</th>
                <th className="px-6 py-3 font-medium text-right">{t('shared.table.unitPrice')}</th>
                <th className="px-6 py-3 font-medium text-center">{t('shared.table.status')}</th>
                <th className="px-6 py-3 font-medium text-right">{t('shared.table.actions')}</th>
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
                        {CATEGORY_LABEL_KEYS[config.category]
                          ? t(CATEGORY_LABEL_KEYS[config.category])
                          : config.category}
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
                          {editActive ? t('config.enabled') : t('config.disabled')}
                        </button>
                      ) : (
                        <Badge tone={config.isActive ? 'success' : 'neutral'}>
                          {config.isActive ? t('config.enabled') : t('config.disabled')}
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
                            {tCommon('actions.save')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                            {tCommon('actions.cancel')}
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
                          {tCommon('actions.edit')}
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
