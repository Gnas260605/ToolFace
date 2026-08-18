import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'viral-hot' | 'viral-warm' | 'viral-cool';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  neutral: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50',
  accent: 'bg-accent-500/10 text-accent-300 border-accent-500/25 font-display',
  'viral-hot': 'bg-rose-950/80 text-rose-300 border-rose-500/60 score-hot shadow-sm font-display',
  'viral-warm': 'bg-amber-950/70 text-amber-300 border-amber-500/50 font-display',
  'viral-cool': 'bg-indigo-950/50 text-indigo-300 border-indigo-500/40 font-display',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  info: 'bg-sky-400',
  neutral: 'bg-zinc-500',
  accent: 'bg-accent-400',
  'viral-hot': 'bg-rose-400 animate-pulse',
  'viral-warm': 'bg-amber-400',
  'viral-cool': 'bg-indigo-400',
};

export function Badge({ children, variant = 'neutral', dot = false, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${variantClasses[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

