'use client';

import { useTranslations } from 'next-intl';
import { ShieldOff } from "lucide-react";

export function FeatureUnavailable() {
  const t = useTranslations('components');
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <ShieldOff className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {t('featureUnavailable.title')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t('featureUnavailable.description')}
        </p>
      </div>
    </div>
  );
}
