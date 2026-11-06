import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 shadow-inner outline-none transition-all duration-150 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 font-sans',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
