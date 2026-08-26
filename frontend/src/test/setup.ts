import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import zhCN from '../../messages/zh-CN';
import en from '../../messages/en';
import { DEFAULT_LOCALE, type Locale } from '../i18n/config';

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

// ============================================================
// next-intl 测试替身:组件用 useTranslations() 渲染真实词典文案,
// 现有测试的中文断言无需改动。需要英文渲染的测试:
//   import { __setTestLocale } from 'next-intl';
//   __setTestLocale('en');
// ============================================================
let testLocale: Locale = DEFAULT_LOCALE;

const CATALOGS: Record<Locale, Record<string, unknown>> = {
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

/** ICU-lite 插值:仅支持 {var} 占位(项目内使用频率最高的语法)。 */
function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in values ? String(values[key]) : m,
  );
}

function translate(fullKey: string, values?: Record<string, unknown>): string {
  const msg = deepGet(CATALOGS[testLocale], fullKey);
  if (typeof msg !== 'string') {
    // 与 next-intl 真实行为一致:缺 key 报错,便于发现词典遗漏
    throw new Error(`next-intl mock: MISSING_MESSAGE "${fullKey}" for locale ${testLocale}`);
  }
  return interpolate(msg, values);
}

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
    useLocale: () => testLocale,
    __setTestLocale: (locale: Locale) => {
      testLocale = locale;
    },
    useTranslations:
      (namespace?: string) =>
      (key: string, values?: Record<string, unknown>): string =>
        translate(namespace ? `${namespace}.${key}` : key, values),
    useFormatter: () => ({
      dateTime: (d: Date | number) => new Date(d).toLocaleString('zh-CN'),
      number: (n: number) => String(n),
      relativeTime: (d: Date | number) => String(d),
    }),
    useNow: () => ({ now: new Date() }),
  };
});

vi.mock('next-intl/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl/server')>();
  return {
    ...actual,
    getLocale: async () => testLocale,
    getTranslations: async (opts?: string | { namespace?: string }) => {
      const namespace = typeof opts === 'string' ? opts : opts?.namespace;
      return (key: string, values?: Record<string, unknown>) =>
        translate(namespace ? `${namespace}.${key}` : key, values);
    },
  };
});
