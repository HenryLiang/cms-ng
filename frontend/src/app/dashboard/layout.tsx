'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProtectedRoute } from '@/hooks/use-protected-route';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { useAuthStore } from '@/store/auth-store';
import { UserRole } from '@cms-ng/shared';
import { LogOut, LayoutDashboard, FileText, Lightbulb, ClipboardCheck, Zap, Wallet, Users, Settings } from 'lucide-react';
import ToastHost from '@/components/toast-host';
import ErrorBoundary from '@/components/error-boundary';

const allNavItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/articles', label: '我的稿件', icon: FileText, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/review', label: '审核台', icon: ClipboardCheck, roles: [UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/stories', label: '选题中心', icon: Lightbulb, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/auto-publish', label: '自动发布', icon: Zap, roles: [UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/billing', label: '计费管理', icon: Wallet, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
  { href: '/dashboard/accounts', label: '账号管理', icon: Users, roles: [UserRole.ADMIN] },
  { href: '/dashboard/settings', label: '系统设置', icon: Settings, roles: [UserRole.ADMIN] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useProtectedRoute();
  useRoleGuard();
  const { user, logout } = useAuthStore();
  const isLoading = useAuthStore((state) => state.isLoading);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const pathname = usePathname();

  const navItems = allNavItems.filter((item) =>
    user?.role ? item.roles.includes(user.role as UserRole) : false
  );

  const roleLabel = {
    [UserRole.REPORTER]: '记者',
    [UserRole.EDITOR]: '编辑',
    [UserRole.ADMIN]: '管理员',
  }[user?.role as UserRole] || '';

  if (!hasHydrated || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-16 items-center border-b border-zinc-200 px-6">
          <span className="text-lg font-semibold">01创作大脑</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-200 p-4">
          <Link
            href="/dashboard/profile"
            className={`flex items-center justify-between rounded-lg px-2 py-2 transition-colors ${
              pathname === '/dashboard/profile' ? 'bg-zinc-100' : 'hover:bg-zinc-50'
            }`}
          >
            <div className="text-sm">
              <p className="font-medium text-zinc-900">{user?.name}</p>
              <p className="text-zinc-500">{user?.email}</p>
              {roleLabel && (
                <span className="inline-block mt-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {roleLabel}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
              }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              title="退出"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-zinc-50">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <ToastHost />
    </div>
  );
}
