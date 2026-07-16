import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'brand-gradient-strong text-white shadow-sm shadow-blue-500/25 hover:brightness-110',
  secondary: 'bg-surface border border-line text-foreground hover:bg-surface-muted',
  ghost: 'text-muted hover:bg-surface-muted hover:text-foreground',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  outline: 'border border-brand text-brand hover:bg-brand-soft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'h-9 w-9',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-medium transition outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:opacity-50 disabled:pointer-events-none';

/** 供 <Link> 等非 button 元素复用按钮样式。 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
