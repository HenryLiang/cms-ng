import { ContentLanguage } from '@cms-ng/shared';

const languageConfig: Record<
  ContentLanguage,
  { label: string; className: string }
> = {
  [ContentLanguage.SIMPLIFIED_CHINESE]: {
    label: '简',
    className: 'bg-blue-50 text-blue-700',
  },
  [ContentLanguage.TRADITIONAL_CHINESE_HK]: {
    label: '繁',
    className: 'bg-purple-50 text-purple-700',
  },
  [ContentLanguage.TRADITIONAL_CHINESE_CANTONESE]: {
    label: '粤',
    className: 'bg-orange-50 text-orange-700',
  },
  [ContentLanguage.ENGLISH]: {
    label: 'EN',
    className: 'bg-emerald-50 text-emerald-700',
  },
};

interface LanguageBadgeProps {
  language?: ContentLanguage;
}

export default function LanguageBadge({ language }: LanguageBadgeProps) {
  if (!language) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500">
        —
      </span>
    );
  }

  const config = languageConfig[language];

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
