import { libT } from '@/i18n/client-dict';

/**
 * 相对时间格式化(newsnow 风格):刚刚 / N分钟前 / N小时前 / 昨天 HH:mm / M月D日。
 * 用于实时热点卡片的「X分钟前更新」与快讯条目的时间标识。
 * 文案走 lib 词典(libT 读 cookie),中英双语。
 *
 * 入参为 ISO 字符串或毫秒时间戳;无效输入返回空串(调用方据此隐藏时间)。
 */
export function formatRelativeTime(value: string | number | Date): string {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(value);
  if (!Number.isFinite(ms)) return '';

  const diff = Date.now() - ms;
  if (diff < 0) return libT('relativeTime.justNow');
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return libT('relativeTime.justNow');
  if (minutes < 60) return libT('relativeTime.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return libT('relativeTime.hoursAgo', { count: hours });

  const date = new Date(ms);
  const now = new Date();
  const isYesterday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate() - 1;
  if (isYesterday) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return libT('relativeTime.yesterdayAt', { time: `${hh}:${mm}` });
  }
  return libT('relativeTime.monthDay', { month: date.getMonth() + 1, day: date.getDate() });
}
