'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles, X } from 'lucide-react';

interface ArticleTagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  onAITag: () => void | Promise<void>;
  aiLoading: boolean;
}

export default function ArticleTagsEditor({
  tags,
  onChange,
  onAITag,
  aiLoading,
}: ArticleTagsEditorProps) {
  const t = useTranslations('components.tagsEditor');
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (!tag) return;
    if (!tags.includes(tag)) onChange([...tags, tag]);
    setInput('');
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{t('title')}</h3>
        <button
          type="button"
          onClick={onAITag}
          disabled={aiLoading}
          className="flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
        >
          {aiLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {t('aiTag')}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-text"
          >
            {tag}
            <button
              type="button"
              aria-label={t('removeTagAria', { tag })}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              className="rounded-full p-0.5 hover:bg-brand/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addTag();
          }
        }}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        placeholder={t('placeholder')}
      />
    </div>
  );
}
