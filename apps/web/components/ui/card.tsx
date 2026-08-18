import React from 'react';

type CardVariant = 'default' | 'glass' | 'outlined' | 'elevated';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-surface-raised border border-zinc-800/60',
  glass: 'glass',
  outlined: 'bg-transparent border border-zinc-800/80',
  elevated: 'bg-surface-raised border border-zinc-800/50 shadow-xl shadow-black/20',
};

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ children, variant = 'default', className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`rounded-xl ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pb-4 mb-4 border-b border-zinc-800/40 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-zinc-100 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-zinc-500 mt-1 ${className}`}>{children}</p>;
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pt-4 mt-4 border-t border-zinc-800/40 ${className}`}>
      {children}
    </div>
  );
}
