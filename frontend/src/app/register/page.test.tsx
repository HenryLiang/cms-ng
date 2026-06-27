import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/register',
}));

// next/link needs an AppRouter context we don't mount in unit tests — render as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => selector({ register: vi.fn() }),
    { getState: () => ({ register: vi.fn() }) },
  ),
}));

vi.mock('@/lib/auth-api', () => ({
  getRegistrationStatus: vi.fn(),
}));

import RegisterPage from './page';
import { getRegistrationStatus } from '@/lib/auth-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterPage - registration switch', () => {
  it('renders the closed panel when registration is disabled', async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({ registrationOpen: false });

    render(<RegisterPage />);

    expect(await screen.findByText('注册已关闭')).toBeInTheDocument();
    expect(
      screen.getByText('管理员已暂时关闭注册功能，请稍后再试。'),
    ).toBeInTheDocument();
    // form should be absent
    expect(screen.queryByText('创建新账户')).not.toBeInTheDocument();
  });

  it('renders the registration form when registration is open', async () => {
    vi.mocked(getRegistrationStatus).mockResolvedValue({ registrationOpen: true });

    render(<RegisterPage />);

    expect(await screen.findByText('创建新账户')).toBeInTheDocument();
    expect(screen.queryByText('注册已关闭')).not.toBeInTheDocument();
  });

  it('fails open (renders the form) when the status fetch errors', async () => {
    vi.mocked(getRegistrationStatus).mockRejectedValue(new Error('network'));

    render(<RegisterPage />);

    expect(await screen.findByText('创建新账户')).toBeInTheDocument();
    expect(screen.queryByText('注册已关闭')).not.toBeInTheDocument();
  });
});
