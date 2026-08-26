'use client';

import {
  ARTICLE_GENRE_CATALOG,
  ArticleGenre,
  MAX_DRAFT_WORD_COUNT,
  MIN_DRAFT_WORD_COUNT,
} from '@cms-ng/shared';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, Card } from '@/components/ui';

interface DraftPreferencesPanelProps {
  genre: ArticleGenre;
  targetWordCount: string;
  instruction: string;
  loading?: boolean;
  onGenreChange: (genre: ArticleGenre) => void;
  onTargetWordCountChange: (value: string) => void;
  onInstructionChange: (value: string) => void;
  onGenerate: () => void;
}

// 文体目录(label/definition/structure/characteristics)来自 @cms-ng/shared 的
// ARTICLE_GENRE_CATALOG,与后端 AI 提示词共用同一数据源,暂不进词典;
// 面板自身的界面文案走 panels.draftPreferences 词典。
export default function DraftPreferencesPanel({
  genre,
  targetWordCount,
  instruction,
  loading = false,
  onGenreChange,
  onTargetWordCountChange,
  onInstructionChange,
  onGenerate,
}: DraftPreferencesPanelProps) {
  const t = useTranslations('panels.draftPreferences');
  const selectedProfile =
    ARTICLE_GENRE_CATALOG.find((profile) => profile.value === genre) ??
    ARTICLE_GENRE_CATALOG[0];
  const parsedWordCount = Number(targetWordCount);
  const wordCountIsValid =
    Number.isInteger(parsedWordCount) &&
    parsedWordCount >= MIN_DRAFT_WORD_COUNT &&
    parsedWordCount <= MAX_DRAFT_WORD_COUNT;

  return (
    <Card className="mb-6">
      <div className="space-y-4 p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
          <p className="mt-1 text-xs text-muted">{t('subtitle')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="space-y-1.5 text-xs font-medium text-foreground">
            <span>{t('genreLabel')}</span>
            <select
              value={genre}
              onChange={(event) =>
                onGenreChange(event.target.value as ArticleGenre)
              }
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {ARTICLE_GENRE_CATALOG.map((profile) => (
                <option key={profile.value} value={profile.value}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5 text-xs font-medium text-foreground">
            <label htmlFor="draft-target-word-count">
              {t('wordCountLabel')}
            </label>
            <div className="relative">
              <input
                id="draft-target-word-count"
                type="number"
                min={MIN_DRAFT_WORD_COUNT}
                max={MAX_DRAFT_WORD_COUNT}
                step="1"
                value={targetWordCount}
                onChange={(event) =>
                  onTargetWordCountChange(event.target.value)
                }
                aria-describedby="draft-word-count-help"
                aria-invalid={!wordCountIsValid}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 pr-9 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted">
                {t('wordUnit')}
              </span>
            </div>
          </div>
        </div>

        <p
          id="draft-word-count-help"
          className={`text-xs ${wordCountIsValid ? 'text-subtle' : 'text-red-600'}`}
        >
          {wordCountIsValid
            ? t('wordCountHelp', {
                min: MIN_DRAFT_WORD_COUNT.toLocaleString(),
                max: MAX_DRAFT_WORD_COUNT.toLocaleString(),
              })
            : t('wordCountInvalid', {
                min: MIN_DRAFT_WORD_COUNT.toLocaleString(),
                max: MAX_DRAFT_WORD_COUNT.toLocaleString(),
              })}
        </p>

        <div className="rounded-lg border border-line bg-surface-muted/60 p-3">
          <p className="text-sm font-medium text-foreground">
            {selectedProfile.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {selectedProfile.definition}
          </p>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-foreground">
              {t('structureSummary')}
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">
                  {t('structureLabel')}
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-4 leading-5">
                  {selectedProfile.structure.map((section) => (
                    <li key={section}>{section}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {t('characteristicsLabel')}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 leading-5">
                  {selectedProfile.characteristics.map((characteristic) => (
                    <li key={characteristic}>{characteristic}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>

        <label className="block space-y-1.5 text-xs font-medium text-foreground">
          <span>{t('instructionLabel')}</span>
          <textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            placeholder={t('instructionPlaceholder')}
          />
        </label>

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            disabled={!wordCountIsValid}
            onClick={onGenerate}
          >
            {!loading && <Sparkles className="h-4 w-4" />}
            {loading ? t('generating') : t('generate')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
