import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

function Badge({
  className,
  variant = 'default',
  ...props
}: BadgeProps) {
  const variantStyles = {
    default:
      'bg-cyan-950/80 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]',
    secondary:
      'bg-slate-800/80 border-slate-700 text-slate-300',
    destructive:
      'bg-rose-950/80 border-rose-500/40 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.15)]',
    outline:
      'border-cyan-500/50 text-cyan-400 bg-transparent',
    success:
      'bg-emerald-950/80 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.15)]',
    warning:
      'bg-amber-950/80 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.15)]',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-semibold tracking-wide transition-colors',
        variantStyles[variant] || variantStyles.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
