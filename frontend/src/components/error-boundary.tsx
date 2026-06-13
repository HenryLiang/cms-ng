'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
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
    // eslint-disable-next-line no-console
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
      return (
        <div
          role="alert"
          className="flex h-full min-h-[60vh] items-center justify-center p-8"
        >
          <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-600" />
            <h2 className="text-lg font-semibold text-amber-900">页面出现了一些问题</h2>
            <p className="mt-2 text-sm text-amber-800">
              请尝试刷新页面，或返回工作台继续操作。
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重新加载
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                返回工作台
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
