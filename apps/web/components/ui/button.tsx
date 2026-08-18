import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'viral';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-accent-500 via-teal-500 to-emerald-600 hover:from-accent-400 hover:to-emerald-500 text-white font-display shadow-md shadow-accent-950/40 btn-shimmer',
  secondary: 'bg-zinc-800/90 hover:bg-zinc-700/90 text-zinc-200 border border-zinc-700/50 font-sans',
  ghost: 'bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 font-sans',
  danger: 'bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30 font-sans',
  outline: 'bg-transparent hover:bg-accent-600/10 text-accent-300 border border-accent-500/30 hover:border-accent-500/50 font-sans',
  viral: 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-display shadow-md shadow-rose-950/50 btn-shimmer',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2.5 text-xs font-bold gap-2 rounded-xl',
  lg: 'px-6 py-3 text-sm font-bold gap-2.5 rounded-xl',
  icon: 'p-2 text-xs rounded-lg aspect-square',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-200 ease-out
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        active:scale-[0.97]
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

