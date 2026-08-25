import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, normalizeLocale } from './config';

/**
 * 消息目录:命名空间 -> 该语言的完整 JSON。
 * 静态 import 映射,避免模板字符串动态导入在 webpack 下不可静态分析。
 */
const CATALOGS = {
  'zh-CN': () => import('../../messages/zh-CN'),
  en: () => import('../../messages/en'),
} as const;

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  const { default: messages } = await CATALOGS[locale]();
  return { locale, messages };
});
