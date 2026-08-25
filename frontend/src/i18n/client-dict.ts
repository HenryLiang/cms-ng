import zhCN from '../../messages/zh-CN';
import en from '../../messages/en';
import { LOCALE_COOKIE, normalizeLocale } from './config';

/**
 * 非 React 环境(lib 工具函数、throw 站点)的词典查询。
 * 与 useTranslations 的区别:读 NEXT_LOCALE cookie 而非 React context,
 * 精度足够 -- 语言切换本身就是「写 cookie + 整页刷新」,每次调用读到的
 * 都是当前页面的语言。仅支持 lib 命名空间。
 */
const CATALOGS = {
  'zh-CN': zhCN as unknown as Record<string, unknown>,
  en: en as unknown as Record<string, unknown>,
};

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in values ? String(values[key]) : m,
  );
}

function readLocaleCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return m?.[1];
}

/** 查 lib 命名空间文案;缺 key 时返回 fallback(默认 key 本身),便于发现遗漏。 */
export function libT(key: string, values?: Record<string, unknown>, fallback?: string): string {
  const locale = normalizeLocale(readLocaleCookie());
  const msg = deepGet(CATALOGS[locale], `lib.${key}`);
  if (typeof msg === 'string') return interpolate(msg, values);
  return fallback ?? key;
}
