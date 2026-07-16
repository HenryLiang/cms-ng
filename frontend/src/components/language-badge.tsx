import { ContentLanguage } from '@cms-ng/shared';

const LABELS: Record<ContentLanguage, string> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: '简',
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: '繁',
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: '粤',
  [ContentLanguage.ENGLISH]: 'EN',
};

interface LanguageBadgeProps {
  language?: ContentLanguage;
}

/** 语言徽章：统一中性底，靠文字区分（保持全站冷调一致）。 */
export default function LanguageBadge({ language }: LanguageBadgeProps) {
  if (!language) {
    return (
      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-subtle">
        -
      </span>
    );
  }
  return (
    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted">
      {LABELS[language]}
    </span>
  );
}
