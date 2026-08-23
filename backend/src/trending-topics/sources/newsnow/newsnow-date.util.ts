/**
 * newsnow 源日期解析工具(轻量版)。
 *
 * 上游 newsnow(server/utils/date.ts)基于 dayjs + 多插件实现 225 行的通用
 * parseRelativeDate/tranformToUTC;这里只实现 vendored 源实际用到的模式,
 * 全部按上海时区(Asia/Shanghai,UTC+8)解释,不引入 dayjs 依赖:
 *
 * - 相对时间:「刚刚」「N秒/分钟/小时/天前」(ithome / kaopu / gelonghui)
 * - 「昨天 [HH:mm]」「前天 [HH:mm]」
 * - 「MM-DD」(当年;若比当前日期晚超过 3 天则视为去年)
 * - 「HH:mm」(当天)
 * - 绝对时间「YYYY-MM-DD[ HH:mm[:ss]]」(jin10 / cankaoxiaoxi,北京时间)
 *
 * 解析失败返回当前时间戳(fail-open,仅影响排序,不阻断数据)。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 上海时区当前墙钟(借 UTC ISO 字符串取字段)。 */
function shanghaiWallClock(now = Date.now()): {
  year: number;
  month: number;
  day: number;
} {
  const iso = new Date(now + SHANGHAI_OFFSET_MS).toISOString();
  const [date] = iso.split('T');
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** 由上海时区日期字段构造时间戳。 */
function shanghaiTimestamp(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
): number {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+08:00`;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : Date.now();
}

/** 绝对时间字符串(北京时间)转时间戳:「2026-08-23 14:32:11」等。 */
export function shanghaiDateTimeToTimestamp(date: string): number {
  const raw = date.trim();
  // 仅日期时补零点:Date-only 形式不接纳时区后缀(「2026-08-23+08:00」
  // 非法,V8 会静默按 UTC 解析),必须先补全成完整日期时间。
  const normalized = /^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)
    ? `${raw}T00:00:00`
    : raw.replace(/\s+/, 'T');
  const ts = Date.parse(`${normalized}+08:00`);
  if (Number.isFinite(ts)) return ts;
  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : Date.now();
}

/**
 * 相对/短格式日期解析(上海时区)。仅覆盖 vendored 源出现的模式,
 * 未匹配时返回当前时间戳。
 */
export function parseShanghaiRelativeDate(date: string): number {
  const raw = date.trim();
  if (!raw || raw === '刚刚') return Date.now();

  const relative = /^(\d+)\s*(秒|分钟|小时|时|天)前$/.exec(raw);
  if (relative) {
    const value = Number(relative[1]);
    const unitMs: Record<string, number> = {
      秒: 1_000,
      分钟: 60_000,
      小时: 3_600_000,
      时: 3_600_000,
      天: 86_400_000,
    };
    return Date.now() - value * (unitMs[relative[2]] ?? 0);
  }

  const dayOffset = /^(昨天|前天)(?:\s*(\d{1,2}):(\d{2}))?$/.exec(raw);
  if (dayOffset) {
    const days = dayOffset[1] === '昨天' ? 1 : 2;
    const now = Date.now() - days * 86_400_000;
    const { year, month, day } = shanghaiWallClock(now);
    return shanghaiTimestamp(
      year,
      month,
      day,
      Number(dayOffset[2] ?? 0),
      Number(dayOffset[3] ?? 0),
    );
  }

  const monthDay = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const { year } = shanghaiWallClock();
    // 目标日期比当前晚超过 3 天 -> 实为去年(跨年榜单)
    const ts = shanghaiTimestamp(year, month, day);
    if (ts - Date.now() > 3 * 86_400_000) {
      return shanghaiTimestamp(year - 1, month, day);
    }
    return ts;
  }

  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (timeOnly) {
    const { year, month, day } = shanghaiWallClock();
    return shanghaiTimestamp(
      year,
      month,
      day,
      Number(timeOnly[1]),
      Number(timeOnly[2]),
    );
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    return shanghaiDateTimeToTimestamp(raw);
  }

  return Date.now();
}
