import { forwardRef } from 'react';
import { cn } from './cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const FIELD =
  'h-10 w-full rounded-lg border border-line bg-surface text-sm text-foreground placeholder:text-subtle ' +
  'outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, ...props }, ref) => {
    if (!leftIcon && !rightIcon) {
      return <input ref={ref} className={cn(FIELD, 'px-3', className)} {...props} />;
    }
    return (
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(FIELD, leftIcon ? 'pl-10' : false, rightIcon ? 'pr-10' : false, className)}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle">{rightIcon}</span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
