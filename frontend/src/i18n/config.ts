/**
 * UI 界面语言配置(与内容语言 ContentLanguage 是两个正交概念):
 * - 界面语言:浏览器级偏好,存 cookie NEXT_LOCALE,默认简体中文
 * - 内容语言:文章/选题的产出语言,存 User/Story/Article 字段,保持 4 值
 *
 * 采用 next-intl「无 URL 路由」模式:登录后使用的内部系统,无 SEO 需求,
 * 不引入 /[locale] 前缀,避免重构全部路由与链接。
 */
export const LOCALES = ['zh-CN', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** next-intl 约定的语言 cookie 名。 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** 语言 cookie 有效期:1 年。 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** LocaleSwitcher 展示用标签。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};
