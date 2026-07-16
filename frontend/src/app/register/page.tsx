'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth-store';
import { Mail, Lock, User, BrainCircuit, Lightbulb, Wand2, Zap, UserPlus } from 'lucide-react';
import { getRegistrationStatus } from '@/lib/auth-api';
import { Button, Input } from '@/components/ui';

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
      setError(apiMsg || '注册失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!statusChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-card">
          <div className="text-center">
            <div className="brand-gradient-strong mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl">
              <BrainCircuit className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">01创作大脑</h1>
            <p className="mt-2 text-sm text-muted">注册已关闭</p>
          </div>
          <div className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-muted">
            管理员已暂时关闭注册功能，请稍后再试。
          </div>
          <p className="text-center text-sm text-muted">
            已有账户？{' '}
            <Link href="/login" className="font-medium text-brand hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* 左：品牌面板 */}
      <div className="glow-panel relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="grid-overlay absolute inset-0 opacity-60" />
        <div className="relative flex items-center gap-3">
          <div className="brand-gradient-strong flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-blue-500/30">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-white">01创作大脑</span>
        </div>

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            加入 AI 驱动的内容创作作业系统
          </div>
          <h2 className="text-3xl font-semibold leading-tight text-white">
            开启你的
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              智能创作之旅
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-sidebar-muted">
            注册后即可使用选题发现、AI 协同写作、编辑审核与多平台自动分发全流程能力。
          </p>
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Lightbulb className="h-4 w-4 text-cyan-400" /> 实时趋势选题与事实核查
            </div>
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Wand2 className="h-4 w-4 text-cyan-400" /> AI 改写 / 扩写 / 润色 / 标题生成
            </div>
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Zap className="h-4 w-4 text-cyan-400" /> 一键多平台自动发布
            </div>
          </div>
        </div>

        <div className="relative text-[11px] text-sidebar-muted">© 2026 01创作大脑 · CMS-NG</div>
      </div>

      {/* 右：表单 */}
      <div className="flex w-full flex-col justify-center bg-canvas p-8 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="brand-gradient-strong mb-4 flex h-10 w-10 items-center justify-center rounded-xl">
              <BrainCircuit className="h-5 w-5 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">创建新账户</h1>
          <p className="mt-2 text-sm text-muted">填写信息，立即开始创作</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">姓名</label>
              <Input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的名字"
                leftIcon={<User className="h-4 w-4" />}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">邮箱</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">密码</label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                leftIcon={<Lock className="h-4 w-4" />}
              />
            </div>

            <Button type="submit" loading={isSubmitting} className="w-full">
              <UserPlus className="h-4 w-4" />
              注册
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            已有账户？{' '}
            <Link href="/login" className="font-medium text-brand hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
