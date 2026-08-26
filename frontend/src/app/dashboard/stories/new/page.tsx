'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createStory } from '@/lib/story-api';
import { useAuthStore } from '@/store/auth-store';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button, Input, buttonClasses } from '@/components/ui';

export default function NewStoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const t = useTranslations('stories');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [angle, setAngle] = useState('');
  const [priority, setPriority] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createStory({
        title,
        description: description || undefined,
        angle: angle || undefined,
        priority,
        deadline: deadline || undefined,
        contentLanguage: user?.preferredLanguage,
      });
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiMsg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(apiMsg || t('form.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToDashboard')}
        </Link>

        <h1 className="text-2xl font-semibold text-foreground">{t('form.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('form.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('form.titleLabel')} <span className="text-red-500">*</span></label>
            <Input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('form.titlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('form.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder={t('form.descriptionPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('form.angleLabel')}</label>
            <Input
              type="text"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder={t('form.anglePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('form.priorityLabel')}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value={0}>{t('form.priority.normal')}</option>
                <option value={1}>{t('form.priority.important')}</option>
                <option value={2}>{t('form.priority.urgent')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('form.deadlineLabel')}</label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" loading={submitting}>
              {t('form.submit')}
            </Button>
            <Link
              href="/dashboard"
              className={buttonClasses({ variant: 'secondary' })}
            >
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
