'use client';

import { useState, useEffect } from 'react';
import {
  Loader2,
  CreditCard,
  Check,
  Smartphone,
  Building2,
  Plus,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import {
  getTopUpRecords,
  manualTopUp,
  type TopUpRecord,
} from '@/lib/billing-api';

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
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('manual');
  const [records, setRecords] = useState<TopUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRecords();
  }, []);

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
    return isNaN(custom) || custom < 10 ? 0 : custom;
  }

  async function handleTopUp() {
    const amount = getSelectedAmount();
    if (amount <= 0) {
      alert('请选择或输入充值金额（最低 ¥10）');
      return;
    }
    if (!user?.id) {
      alert('用户信息未加载，请刷新页面');
      return;
    }

    setSubmitting(true);
    try {
      await manualTopUp({
        targetUserId: user.id,
        amount,
        reason: '管理员手动充值',
      });
      alert(`充值成功！¥${amount.toFixed(2)} 已到账`);
      setSelectedPackage(null);
      setCustomAmount('');
      await loadRecords();
    } catch (err) {
      alert(`充值失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSubmitting(false);
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
        <h1 className="text-2xl font-semibold">充值</h1>
        <p className="mt-1 text-sm text-zinc-500">为账户充值以使用 AI 和发布功能</p>
      </div>

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
                ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            {selectedPackage === idx && (
              <div className="absolute right-2 top-2">
                <Check className="h-4 w-4 text-zinc-900" />
              </div>
            )}
            <p className="text-xs text-zinc-500">{pkg.name}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">¥{pkg.amount.toLocaleString()}</p>
            {pkg.bonus > 0 && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                赠送 ¥{pkg.bonus}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-6 max-w-md">
        <label className="block text-xs font-medium text-zinc-700 mb-1">自定义金额</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">¥</span>
          <input
            type="number"
            min={10}
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedPackage(null);
            }}
            placeholder="最低 ¥10"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-zinc-700 mb-2">支付方式</label>
        <div className="flex gap-3">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            return (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  paymentMethod === method.id
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {method.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit Button */}
      <div className="mb-10">
        <button
          onClick={handleTopUp}
          disabled={submitting || getSelectedAmount() <= 0}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-8 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          确认充值 {getSelectedAmount() > 0 && `¥${getSelectedAmount().toFixed(2)}`}
        </button>
      </div>

      {/* Top-up History */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">充值记录</h2>
        </div>

        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-500">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">用户</th>
                <th className="px-6 py-3 font-medium">金额</th>
                <th className="px-6 py-3 font-medium">到账</th>
                <th className="px-6 py-3 font-medium">方式</th>
                <th className="px-6 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-6 py-3 text-zinc-500">
                    {new Date(record.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-6 py-3 text-zinc-700">{record.user.name}</td>
                  <td className="px-6 py-3 font-medium text-zinc-900">
                    ¥{record.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-emerald-600">
                    +¥{(record.creditsAdded + record.bonusCredits).toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {record.paymentMethod === 'MANUAL' ? '手动' : record.paymentMethod}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        record.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : record.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {statusLabels[record.status] || record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
