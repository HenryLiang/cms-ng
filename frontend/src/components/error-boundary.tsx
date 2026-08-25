'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card, buttonClasses } from '@/components/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

function ErrorFallback({ onReload }: { onReload: () => void }) {
  const t = useTranslations('components');
  return (
    <div
      role="alert"
      className="flex h-full min-h-[60vh] items-center justify-center p-8"
    >
      <Card className="max-w-md p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-600" />
        <h2 className="text-lg font-semibold text-foreground">{t('errorBoundary.title')}</h2>
        <p className="mt-2 text-sm text-muted">
          {t('errorBoundary.description')}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" variant="primary" onClick={onReload}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t('errorBoundary.reload')}
          </Button>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: 'secondary' })}
          >
            {t('errorBoundary.backToDashboard')}
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    // Log to console for developer visibility; in production this would
    // be wired to an error reporting service (Sentry / Datadog / etc.).
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
