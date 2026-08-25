'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  Smartphone,
  Building2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/auth-store';
import {
  getTopUpRecords,
  manualTopUp,
  createOnlineTopUp,
  type TopUpRecord,
} from '@/lib/billing-api';
import { getUsers } from '@/lib/users-api';
import type { User } from '@/types/auth';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';

const PACKAGE_DEFS = [
  { key: 'trial', amount: 100, bonus: 0 },
  { key: 'basic', amount: 500, bonus: 25 },
  { key: 'pro', amount: 2000, bonus: 200 },
  { key: 'enterprise', amount: 10000, bonus: 1500 },
];

const PAYMENT_METHODS = [
  { id: 'alipay', key: 'alipay', icon: Smartphone },
  { id: 'wechat', key: 'wechat', icon: Smartphone },
  { id: 'manual', key: 'manual', icon: Building2 },
];

export default function TopUpPage() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('alipay');
  const [records, setRecords] = useState<TopUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Records are admin-only (getTopUpRecords is @Roles ADMIN). Non-admins must skip the call,
  // otherwise they get a 403 toast on page load (api.ts reports all non-401 errors).
  useEffect(() => {
    if (!isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- non-admin ends loading directly
      setLoading(false);
      return;
    }
    setLoading(true);
    loadRecords();
  }, [isAdmin]);

  // Defensive: a non-admin can never reach 'manual' (button hidden, default 'alipay'),
  // but if role/payment state ever disagree, fall back to a visible method.
  useEffect(() => {
    if (!isAdmin && paymentMethod === 'manual') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- defensive payment method fallback
      setPaymentMethod('alipay');
    }
  }, [isAdmin, paymentMethod]);

  // Load the user list for the manual top-up target picker (admin only).
  useEffect(() => {
    if (!isAdmin || paymentMethod !== 'manual' || users.length > 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount:setUsersLoading triggers synchronously
    setUsersLoading(true);
    getUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, paymentMethod, users.length]);

  async function loadRecords() {
    try {
      const data = await getTopUpRecords(1, 20);
      setRecords(data.data);
    } finally {
      setLoading(false);
    }
  }

  function getSelectedAmount(): number {
    if (selectedPackage !== null) {
      return PACKAGE_DEFS[selectedPackage].amount;
    }
    const custom = parseFloat(customAmount);
    const minAmount = paymentMethod === 'manual' ? 0.01 : 10;
    return isNaN(custom) || custom < minAmount ? 0 : custom;
  }

  async function handleTopUp() {
    const amount = getSelectedAmount();
    const minAmount = paymentMethod === 'manual' ? 0.01 : 10;
    if (amount <= 0) {
      alert(t('topUp.invalidAmount', { minAmount }));
      return;
    }
    if (paymentMethod === 'manual' && !targetUserId) {
      alert(t('topUp.selectTargetUser'));
      return;
    }
    if (!user?.id) {
      alert(t('topUp.userNotLoaded'));
      return;
    }

    setSubmitting(true);
    try {
      if (paymentMethod === 'manual') {
        const target = users.find((u) => u.id === targetUserId);
        await manualTopUp({
          targetUserId,
          amount,
          reason: target
            ? t('topUp.manualReason', { name: target.name })
            : t('topUp.manualReasonNoTarget'),
        });
        alert(
          target
            ? t('topUp.successAlertWithTarget', { amount: amount.toFixed(2), name: target.name })
            : t('topUp.successAlert', { amount: amount.toFixed(2) }),
        );
        setSelectedPackage(null);
        setCustomAmount('');
        setTargetUserId('');
        await loadRecords();
      } else if (paymentMethod === 'alipay') {
        const { paymentUrl } = await createOnlineTopUp({
          amount,
          paymentMethod: 'ALIPAY',
        });
        window.location.href = paymentUrl;
        return;
      } else if (paymentMethod === 'wechat') {
        const { qrCodeUrl } = await createOnlineTopUp({
          amount,
          paymentMethod: 'WECHAT_PAY',
        });
        if (qrCodeUrl) {
          window.open(qrCodeUrl, '_blank', 'width=420,height=420');
        }
        alert(t('topUp.wechatScanHint'));
        await loadRecords();
      }
    } catch (err) {
      alert(
        t('topUp.failedAlert', {
          message: err instanceof Error ? err.message : t('shared.unknownError'),
        }),
      );
    } finally {
      if (paymentMethod !== 'alipay') {
        setSubmitting(false);
      }
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
        title={t('topUp.title')}
        subtitle={t('topUp.subtitle')}
      />

      {/* Package Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {PACKAGE_DEFS.map((pkg, idx) => (
          <button
            key={pkg.key}
            onClick={() => {
              setSelectedPackage(idx);
              setCustomAmount('');
            }}
            className={`relative rounded-lg border p-4 text-left transition-all ${
              selectedPackage === idx
                ? 'border-brand bg-brand-soft ring-1 ring-brand'
                : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            {selectedPackage === idx && (
              <div className="absolute right-2 top-2">
                <Check className="h-4 w-4 text-brand" />
              </div>
            )}
            <p className="text-xs text-muted">{t(`topUp.packages.${pkg.key}`)}</p>
            <p className="tnum mt-1 text-xl font-semibold text-foreground">¥{pkg.amount.toLocaleString()}</p>
            {pkg.bonus > 0 && paymentMethod !== 'manual' && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                {t('topUp.bonus', { amount: pkg.bonus })}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-6 max-w-md">
        <label className="block text-xs font-medium text-foreground mb-1">{t('topUp.customAmount')}</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">¥</span>
          <Input
            type="number"
            min={paymentMethod === 'manual' ? 0.01 : 10}
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedPackage(null);
            }}
            placeholder={paymentMethod === 'manual' ? t('topUp.minAmountManual') : t('topUp.minAmountOnline')}
          />
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-foreground mb-2">{t('topUp.paymentMethodLabel')}</label>
        <div className="flex gap-3">
          {PAYMENT_METHODS
            .filter((m) => m.id !== 'manual' || isAdmin)
            .map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                    paymentMethod === method.id
                      ? 'brand-gradient-strong border-brand text-white'
                      : 'border-line bg-surface text-foreground hover:border-line-strong'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(`topUp.paymentMethods.${method.key}`)}
                </button>
              );
            })}
        </div>
      </div>

      {/* Target User (admin manual top-up only) */}
      {paymentMethod === 'manual' && (
        <div className="mb-6 max-w-md">
          <label htmlFor="target-user" className="block text-xs font-medium text-foreground mb-1">
            {t('topUp.targetUserLabel')}
          </label>
          <select
            id="target-user"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            disabled={usersLoading}
            className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
          >
            <option value="">{usersLoading ? tCommon('state.loading') : t('topUp.selectUserPlaceholder')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {t('topUp.userOption', { name: u.name, email: u.email })}
              </option>
            ))}
          </select>
          {users.length === 0 && !usersLoading && (
            <p className="mt-1 text-xs text-amber-600">{t('topUp.noUsersFound')}</p>
          )}
        </div>
      )}

      {/* Submit Button */}
      <div className="mb-10">
        <Button
          onClick={handleTopUp}
          disabled={submitting || getSelectedAmount() <= 0}
          loading={submitting}
          className="px-8 py-3"
        >
          <CreditCard className="h-4 w-4" />
          {t('topUp.confirmButton')} {getSelectedAmount() > 0 && `¥${getSelectedAmount().toFixed(2)}`}
        </Button>
      </div>

      {/* Top-up History (admin only - getTopUpRecords is @Roles ADMIN) */}
      {isAdmin && (
      <Card>
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">{t('topUp.recordsTitle')}</h2>
        </div>

        {records.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">{tCommon('state.empty')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">{t('shared.table.time')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.user')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.amount')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.credited')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.method')}</th>
                <th className="px-6 py-3 font-medium">{t('shared.table.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((record) => (
                <tr key={record.id} className="transition hover:bg-surface-muted/50">
                  <td className="tnum px-6 py-3 text-muted">
                    {new Date(record.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-6 py-3 text-foreground">{record.user.name}</td>
                  <td className="tnum px-6 py-3 font-medium text-foreground">
                    ¥{record.amount.toFixed(2)}
                  </td>
                  <td className="tnum px-6 py-3 text-emerald-600">
                    +¥{(record.creditsAdded + record.bonusCredits).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-muted">
                    {record.paymentMethod === 'MANUAL' ? t('topUp.manualMethod') : record.paymentMethod}
                  </td>
                  <td className="px-6 py-3">
                    <Badge
                      tone={
                        record.status === 'COMPLETED'
                          ? 'success'
                          : record.status === 'PENDING'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {t(`topUp.status.${record.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      )}
    </div>
  );
}
