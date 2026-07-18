'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  Check,
  Smartphone,
  Building2,
} from 'lucide-react';
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

const packages = [
  { name: '试用包', amount: 100, bonus: 0 },
  { name: '基础包', amount: 500, bonus: 25 },
  { name: '专业包', amount: 2000, bonus: 200 },
  { name: '机构包', amount: 10000, bonus: 1500 },
];

const paymentMethods = [
  { id: 'alipay', label: '支付宝', icon: Smartphone },
  { id: 'wechat', label: '微信支付', icon: Smartphone },
  { id: 'manual', label: '手动充值', icon: Building2 },
];

const statusLabels: Record<string, string> = {
  PENDING: '待支付',
  COMPLETED: '已完成',
  FAILED: '失败',
  REFUNDED: '已退款',
};

export default function TopUpPage() {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 非管理员直接结束 loading
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 防御性回退支付方式
      setPaymentMethod('alipay');
    }
  }, [isAdmin, paymentMethod]);

  // Load the user list for the manual top-up target picker (admin only).
  useEffect(() => {
    if (!isAdmin || paymentMethod !== 'manual' || users.length > 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount:setUsersLoading 同步触发
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
      return packages[selectedPackage].amount;
    }
    const custom = parseFloat(customAmount);
    const minAmount = paymentMethod === 'manual' ? 0.01 : 10;
    return isNaN(custom) || custom < minAmount ? 0 : custom;
  }

  async function handleTopUp() {
    const amount = getSelectedAmount();
    const minAmount = paymentMethod === 'manual' ? 0.01 : 10;
    if (amount <= 0) {
      alert(`请选择或输入充值金额（最低 ¥${minAmount}）`);
      return;
    }
    if (paymentMethod === 'manual' && !targetUserId) {
      alert('请选择充值目标用户');
      return;
    }
    if (!user?.id) {
      alert('用户信息未加载，请刷新页面');
      return;
    }

    setSubmitting(true);
    try {
      if (paymentMethod === 'manual') {
        // 管理员手动充值:为所选目标账户充值,绕过支付通道
        const target = users.find((u) => u.id === targetUserId);
        await manualTopUp({
          targetUserId,
          amount,
          reason: `管理员手动充值${target ? `（${target.name}）` : ''}`,
        });
        alert(`充值成功！¥${amount.toFixed(2)} 已到账${target ? `（${target.name}）` : ''}`);
        setSelectedPackage(null);
        setCustomAmount('');
        setTargetUserId('');
        await loadRecords();
      } else if (paymentMethod === 'alipay') {
        // 支付宝:后端创建订单,返回支付 URL,前端跳转
        const { paymentUrl } = await createOnlineTopUp({
          amount,
          paymentMethod: 'ALIPAY',
        });
        // 跳转后页面生命周期结束,不要 reset 状态
        window.location.href = paymentUrl;
        return;
      } else if (paymentMethod === 'wechat') {
        // 微信支付:后端返回二维码 URL,新窗口打开
        const { qrCodeUrl } = await createOnlineTopUp({
          amount,
          paymentMethod: 'WECHAT_PAY',
        });
        if (qrCodeUrl) {
          window.open(qrCodeUrl, '_blank', 'width=420,height=420');
        }
        alert('请用微信扫描二维码完成支付,支付成功后将自动到账');
        await loadRecords();
      }
    } catch (err) {
      alert(`充值失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      if (paymentMethod !== 'alipay') {
        setSubmitting(false);
      }
      // alipay 分支跳转后,本页会被销毁,无需 reset
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
        title="充值"
        subtitle="为账户充值以使用 AI 和发布功能"
      />

      {/* Package Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {packages.map((pkg, idx) => (
          <button
            key={pkg.name}
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
            <p className="text-xs text-muted">{pkg.name}</p>
            <p className="tnum mt-1 text-xl font-semibold text-foreground">¥{pkg.amount.toLocaleString()}</p>
            {pkg.bonus > 0 && paymentMethod !== 'manual' && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                赠送 ¥{pkg.bonus}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-6 max-w-md">
        <label className="block text-xs font-medium text-foreground mb-1">自定义金额</label>
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
            placeholder={paymentMethod === 'manual' ? '最低 ¥0.01' : '最低 ¥10'}
          />
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-foreground mb-2">支付方式</label>
        <div className="flex gap-3">
          {paymentMethods
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
                  {method.label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Target User (admin manual top-up only) */}
      {paymentMethod === 'manual' && (
        <div className="mb-6 max-w-md">
          <label htmlFor="target-user" className="block text-xs font-medium text-foreground mb-1">
            充值目标用户
          </label>
          <select
            id="target-user"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            disabled={usersLoading}
            className="w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
          >
            <option value="">{usersLoading ? '加载中…' : '请选择用户'}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}（{u.email}）
              </option>
            ))}
          </select>
          {users.length === 0 && !usersLoading && (
            <p className="mt-1 text-xs text-amber-600">未找到可充值的用户</p>
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
          确认充值 {getSelectedAmount() > 0 && `¥${getSelectedAmount().toFixed(2)}`}
        </Button>
      </div>

      {/* Top-up History (admin only - getTopUpRecords is @Roles ADMIN) */}
      {isAdmin && (
      <Card>
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">充值记录</h2>
        </div>

        {records.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">用户</th>
                <th className="px-6 py-3 font-medium">金额</th>
                <th className="px-6 py-3 font-medium">到账</th>
                <th className="px-6 py-3 font-medium">方式</th>
                <th className="px-6 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((record) => (
                <tr key={record.id} className="transition hover:bg-surface-muted/50">
                  <td className="tnum px-6 py-3 text-muted">
                    {new Date(record.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-6 py-3 text-foreground">{record.user.name}</td>
                  <td className="tnum px-6 py-3 font-medium text-foreground">
                    ¥{record.amount.toFixed(2)}
                  </td>
                  <td className="tnum px-6 py-3 text-emerald-600">
                    +¥{(record.creditsAdded + record.bonusCredits).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-muted">
                    {record.paymentMethod === 'MANUAL' ? '手动' : record.paymentMethod}
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
                      {statusLabels[record.status] || record.status}
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
