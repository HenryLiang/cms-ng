'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth-store';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import { getRegistrationStatus } from '@/lib/auth-api';

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 注册开关状态：默认开放。拉取失败时静默当作开放（后端 register() gate 才是真守卫）。
  const [statusChecked, setStatusChecked] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRegistrationStatus()
      .then((status) => {
        if (cancelled) return;
        setRegistrationOpen(status.registrationOpen);
        setStatusChecked(true);
      })
      .catch(() => {
        // 拉取失败当作开放：后端 gate 是真守卫，前端不阻断注册页渲染。
        if (cancelled) return;
        setRegistrationOpen(true);
        setStatusChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await register(email, name, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      setError(apiMsg || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!statusChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">01创作大脑</h1>
            <p className="mt-2 text-sm text-zinc-500">注册已关闭</p>
          </div>
          <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            管理员已暂时关闭注册功能，请稍后再试。
          </div>
          <p className="text-center text-sm text-zinc-500">
            已有账户？{' '}
            <Link href="/login" className="font-medium text-zinc-900 hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">01创作大脑</h1>
          <p className="mt-2 text-sm text-zinc-500">创建新账户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">姓名</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                placeholder="你的名字"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">邮箱</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                placeholder="••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          已有账户？{' '}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
