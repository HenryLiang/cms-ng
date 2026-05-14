'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProtectedRoute } from '@/hooks/use-protected-route';
import { useAuthStore } from '@/store/auth-store';
import { LogOut, LayoutDashboard, FileText, Lightbulb } from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/dashboard/articles', label: '我的稿件', icon: FileText },
  { href: '/dashboard/stories', label: '选题中心', icon: Lightbulb },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useProtectedRoute();
  const { user, logout } = useAuthStore();
  const isLoading = useAuthStore((state) => state.isLoading);
  const pathname = usePathname();

  if (isLoading) {
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
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <p className="font-medium text-zinc-900">{user?.name}</p>
              <p className="text-zinc-500">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              title="退出"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-zinc-50">{children}</main>
    </div>
  );
}
