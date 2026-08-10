"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleDollarSign,
  CircleCheckBig,
  Info,
  Loader2,
  Zap,
} from "lucide-react";
import {
  NotificationLevel,
  NotificationType,
  type NotificationItem,
} from "@cms-ng/shared";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-api";

const REFRESH_INTERVAL_MS = 30_000;
const POPUP_DURATION_MS = 2_000;

function formatRelativeTime(value: string): string {
  const elapsedMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function NotificationIcon({ item }: { item: NotificationItem }) {
  if (item.type === NotificationType.BILLING) {
    return <CircleDollarSign className="h-4 w-4 text-amber-500" />;
  }
  if (item.level === NotificationLevel.ERROR) {
    return <CircleAlert className="h-4 w-4 text-red-500" />;
  }
  if (item.level === NotificationLevel.SUCCESS) {
    return <CircleCheckBig className="h-4 w-4 text-emerald-500" />;
  }
  if (item.type === NotificationType.TASK) {
    return <Zap className="h-4 w-4 text-cyan-500" />;
  }
  return <Info className="h-4 w-4 text-blue-500" />;
}

function NotificationPopup({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: () => void;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted ring-1 ring-line/80">
        <NotificationIcon item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-600">
          新消息
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
          {item.title}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted">
          {item.message}
        </span>
      </span>
    </>
  );

  return (
    <div
      role="status"
      aria-label={`新通知：${item.title}`}
      className="notification-popup absolute right-0 top-12 z-[70] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line/90 bg-surface/95 shadow-2xl shadow-slate-950/15 backdrop-blur"
    >
      {item.actionUrl ? (
        <Link
          href={item.actionUrl}
          onClick={onOpen}
          className="flex gap-3 p-3.5 text-left transition-colors hover:bg-surface-muted/70"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full gap-3 p-3.5 text-left transition-colors hover:bg-surface-muted/70"
        >
          {content}
        </button>
      )}
      <span
        aria-hidden="true"
        className="notification-popup-progress block h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500"
      />
    </div>
  );
}

export default function NotificationBell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mutationVersion = useRef(0);
  const seenNotificationIds = useRef<Set<string> | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [popupQueue, setPopupQueue] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const versionAtRequest = mutationVersion.current;
    try {
      const data = await getNotifications(20);
      if (versionAtRequest !== mutationVersion.current) return;
      if (seenNotificationIds.current === null) {
        seenNotificationIds.current = new Set(data.items.map((item) => item.id));
      } else {
        const newItems = data.items
          .filter(
            (item) =>
              !item.readAt && !seenNotificationIds.current?.has(item.id),
          )
          .reverse();
        data.items.forEach((item) => seenNotificationIds.current?.add(item.id));
        if (newItems.length > 0) {
          setPopupQueue((current) => {
            const queuedIds = new Set(current.map((item) => item.id));
            return [
              ...current,
              ...newItems.filter((item) => !queuedIds.has(item.id)),
            ];
          });
        }
      }
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(
      () => void refresh(),
      REFRESH_INTERVAL_MS,
    );
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activePopup = popupQueue[0] ?? null;

  useEffect(() => {
    if (!activePopup) return;
    const timeout = window.setTimeout(() => {
      setPopupQueue((current) =>
        current[0]?.id === activePopup.id
          ? current.slice(1)
          : current.filter((item) => item.id !== activePopup.id),
      );
    }, POPUP_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [activePopup]);

  const markRead = (item: NotificationItem) => {
    setPopupQueue((current) =>
      current.filter((entry) => entry.id !== item.id),
    );
    if (item.readAt) return;
    mutationVersion.current += 1;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, readAt: now } : entry,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    void markNotificationRead(item.id).catch(() => void refresh());
  };

  const markAllRead = async () => {
    mutationVersion.current += 1;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: now })),
    );
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void refresh();
    }
  };

  const triggerLabel = unreadCount
    ? `通知，${unreadCount} 条未读`
    : "通知，无未读消息";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void refresh();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-semibold leading-4 text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {activePopup && (
        <NotificationPopup
          key={activePopup.id}
          item={activePopup}
          onOpen={() => {
            markRead(activePopup);
            setOpen(false);
          }}
        />
      )}

      {open && (
        <section
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-11 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-slate-950/15"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">通知</h2>
              <p className="mt-0.5 text-xs text-subtle">
                {unreadCount ? `${unreadCount} 条未读消息` : "已全部读完"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-cyan-600 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:text-subtle"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              全部已读
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-subtle">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : loadFailed && items.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-subtle">
                通知加载失败，请稍后重试
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-subtle/60" />
                <p className="mt-2 text-sm text-subtle">暂时没有通知</p>
              </div>
            ) : (
              items.map((item) => {
                const content = (
                  <>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted">
                      <NotificationIcon item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="flex-1 text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        {!item.readAt && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {item.message}
                      </span>
                      <span className="mt-1.5 block text-[11px] text-subtle">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </span>
                  </>
                );
                const className = `flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition last:border-0 hover:bg-surface-muted/70 ${
                  item.readAt ? "bg-surface" : "bg-cyan-500/[0.035]"
                }`;

                return item.actionUrl ? (
                  <Link
                    key={item.id}
                    href={item.actionUrl}
                    onClick={() => {
                      markRead(item);
                      setOpen(false);
                    }}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => markRead(item)}
                    className={className}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
