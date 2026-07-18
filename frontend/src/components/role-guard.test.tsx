import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@cms-ng/shared';

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector?: (state: { user: { role: UserRole } | null }) => unknown) => {
    const state = {
      user: mockUser,
    };
    return selector ? selector(state) : state;
  },
}));

let mockUser: { role: UserRole } | null = null;

import { RoleGuard } from './role-guard';

describe('RoleGuard', () => {
  it('should render children when user has allowed role', () => {
    mockUser = { role: UserRole.EDITOR };

    render(
      <RoleGuard roles={[UserRole.EDITOR, UserRole.ADMIN]}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render children when user is ADMIN and ADMIN is allowed', () => {
    mockUser = { role: UserRole.ADMIN };

    render(
      <RoleGuard roles={[UserRole.EDITOR, UserRole.ADMIN]}>
        <div data-testid="admin-content">Admin View</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
  });

  it('should render fallback when ADMIN is not in allowed roles', () => {
    mockUser = { role: UserRole.ADMIN };

    render(
      <RoleGuard roles={[UserRole.EDITOR]} fallback={<div data-testid="fallback">No Access</div>}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('should render fallback when user role is not allowed', () => {
    mockUser = { role: UserRole.REPORTER };

    render(
      <RoleGuard roles={[UserRole.EDITOR, UserRole.ADMIN]} fallback={<div data-testid="fallback">No Access</div>}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('should render null by default when user role is not allowed', () => {
    mockUser = { role: UserRole.REPORTER };

    const { container } = render(
      <RoleGuard roles={[UserRole.ADMIN]}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('should render null when user is not logged in', () => {
    mockUser = null;

    const { container } = render(
      <RoleGuard roles={[UserRole.REPORTER]}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('should render fallback when user is not logged in', () => {
    mockUser = null;

    render(
      <RoleGuard roles={[UserRole.REPORTER]} fallback={<div data-testid="fallback">Please login</div>}>
        <div data-testid="protected-content">Protected</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });
});
