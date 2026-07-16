'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProtectedRoute } from '@/hooks/use-protected-route';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { useAuthStore } from '@/store/auth-store';
import { UserRole } from '@cms-ng/shared';
import {
  LogOut,
  LayoutDashboard,
  FileText,
  Lightbulb,
  ClipboardCheck,
  Zap,
  Wallet,
  Users,
  Settings,
  Images,
  Search,
  Bell,
  SlidersHorizontal,
  BrainCircuit,
  type LucideIcon,
} from 'lucide-react';
import ToastHost from '@/components/toast-host';
import ErrorBoundary from '@/components/error-boundary';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  badge?: number;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '工作区',
    items: [
      { href: '/dashboard', label: '工作台', icon: LayoutDashboard, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
      { href: '/dashboard/articles', label: '稿件管理', icon: FileText, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
      { href: '/dashboard/media', label: '媒体库', icon: Images, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
      { href: '/dashboard/review', label: '审核台', icon: ClipboardCheck, roles: [UserRole.EDITOR, UserRole.ADMIN] },
      { href: '/dashboard/stories', label: '选题中心', icon: Lightbulb, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
    ],
  },
  {
    label: '自动化',
    items: [
      { href: '/dashboard/auto-publish', label: '自动发布', icon: Zap, roles: [UserRole.EDITOR, UserRole.ADMIN] },
      { href: '/dashboard/billing', label: '计费管理', icon: Wallet, roles: [UserRole.REPORTER, UserRole.EDITOR, UserRole.ADMIN] },
    ],
  },
  {
    label: '系统',
    items: [
      { href: '/dashboard/accounts', label: '账号管理', icon: Users, roles: [UserRole.ADMIN] },
      { href: '/dashboard/settings', label: '系统设置', icon: Settings, roles: [UserRole.ADMIN] },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.REPORTER]: '记者',
  [UserRole.EDITOR]: '编辑',
  [UserRole.ADMIN]: '管理员',
};

const ROLE_CODES: Record<UserRole, string> = {
  [UserRole.REPORTER]: 'REPORTER',
  [UserRole.EDITOR]: 'EDITOR',
  [UserRole.ADMIN]: 'ADMIN',
};

function isItemActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  // /dashboard 不应被 /dashboard/articles 的高亮命中
  if (href === '/dashboard') return false;
  return pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useProtectedRoute();
  useRoleGuard();
  const { user, logout } = useAuthStore();
  const isLoading = useAuthStore((state) => state.isLoading);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const pathname = usePathname();

  const role = user?.role as UserRole | undefined;
  const roleLabel = role ? ROLE_LABELS[role] : '';
  const roleCode = role ? ROLE_CODES[role] : '';

  // 过滤出当前角色可见的导航分组
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => (role ? item.roles.includes(role) : false)),
  })).filter((group) => group.items.length > 0);

  // 顶栏面包屑：取当前激活的导航项标签
  const activeItem = NAV_GROUPS.flatMap((g) => g.items).find((item) =>
    isItemActive(pathname, item.href),
  );
  const profileActive = pathname === '/dashboard/profile';

  if (!hasHydrated || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 深色侧栏 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text">
        {/* Logo */}
        <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="brand-gradient-strong flex h-8 w-8 items-center justify-center rounded-lg shadow-lg shadow-blue-500/20">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">01创作大脑</div>
            <div className="text-[10px] tracking-wide text-sidebar-muted">CMS · NG</div>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1.5 pt-4 text-[10px] font-medium uppercase tracking-wider text-sidebar-muted/70">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sidebar-elevated text-white'
                        : 'text-sidebar-muted hover:bg-sidebar-elevated/60 hover:text-white'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400" />
                    )}
                    <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : ''}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 用户卡 */}
        <div className="border-t border-sidebar-border p-3">
          <Link
            href="/dashboard/profile"
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
              profileActive ? 'bg-sidebar-elevated' : 'hover:bg-sidebar-elevated/60'
            }`}
          >
            <div className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
              {user?.name?.[0] ?? '?'}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium text-white">{user?.name}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-sidebar-muted">{roleLabel}</span>
                {roleCode && (
                  <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-medium text-cyan-300">
                    {roleCode}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
              }}
              className="rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-elevated hover:text-white"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </Link>
        </div>
      </aside>

      {/* 右侧：顶栏 + 内容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶栏 */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <LayoutDashboard className="h-4 w-4 text-subtle" />
            <span className="text-muted">{activeItem?.label ?? '工作台'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* 全局搜索（视觉占位，后续接入全局检索） */}
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                className="h-9 w-64 rounded-lg border border-line bg-surface pl-8 pr-12 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="搜索稿件、选题…"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                ⌘K
              </kbd>
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground" title="筛选">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground" title="通知">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan-400" />
            </button>
            <Link
              href="/dashboard/profile"
              className="brand-gradient ml-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              title={user?.email}
            >
              {user?.name?.[0] ?? '?'}
            </Link>
          </div>
        </header>

        {/* 内容区 */}
        <main className="flex-1 overflow-auto bg-canvas">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}
