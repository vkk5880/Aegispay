import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default:
        'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:from-cyan-400 hover:to-blue-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] border-transparent',
      outline:
        'border-cyan-500/40 bg-slate-900/60 text-slate-200 hover:border-cyan-400 hover:bg-cyan-950/40 hover:text-white',
      secondary:
        'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border-slate-700',
      ghost:
        'bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border-transparent',
      destructive:
        'bg-rose-950/80 border-rose-500/40 text-rose-300 hover:bg-rose-900 hover:text-white shadow-[0_0_15px_rgba(244,63,94,0.2)]',
      link:
        'text-cyan-400 underline-offset-4 hover:underline bg-transparent border-transparent p-0',
    };

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-xs font-semibold',
      sm: 'h-7 px-3 text-[11px] font-medium rounded-lg',
      lg: 'h-11 px-6 text-sm font-bold rounded-xl',
      icon: 'h-9 w-9 p-0 flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-xl font-mono uppercase tracking-wider transition-all duration-150 outline-none select-none border focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-95',
          variantStyles[variant] || variantStyles.default,
          sizeStyles[size] || sizeStyles.default,
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
