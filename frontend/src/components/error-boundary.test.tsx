import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './error-boundary';

beforeEach(() => {
  // Suppress console.error noise from the boundary
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div>safe child</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    // Fallback should have role=alert for accessibility
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    // Children are NOT rendered
    expect(screen.queryByText('safe child')).not.toBeInTheDocument();
  });

  it('fallback shows a reload button', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    // Look for a button that triggers reload (Chinese: 重新加载 or English: reload)
    const reloadBtn = screen.getByRole('button', { name: /重新加载|reload|刷新/i });
    expect(reloadBtn).toBeInTheDocument();
  });

  it('fallback shows a "back to home" link', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    const homeLink = screen.getByRole('link', { name: /工作台|home|首页|返回/i });
    expect(homeLink).toBeInTheDocument();
  });

  it('does not show the error details in production (no raw error message)', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    // The raw error message "boom" should NOT be shown to the user
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('calls onError callback when an error is caught', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalled();
    const [err] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('boom');
  });
});
