'use client';

import { useTranslations } from 'next-intl';
import { ContentLanguage } from '@cms-ng/shared';

const KEY_MAP: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: 'zh',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: 'zhHk',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: 'yue',
  [ContentLanguage.ENGLISH]: 'en',
};

interface LanguageBadgeProps {
  language?: ContentLanguage;
}

/** 语言徽章：统一中性底，靠文字区分（保持全站冷调一致）。 */
export default function LanguageBadge({ language }: LanguageBadgeProps) {
  const t = useTranslations('components.languageBadge');
  if (!language) {
    return (
      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-subtle">
        -
      </span>
    );
  }
  return (
    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {t(KEY_MAP[language])}
    </span>
  );
}
