import React from 'react';

/* ─── Text Input ──────────────────────────────────────────── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, hint, error, icon, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-zinc-400 tracking-wide font-display">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">{icon}</span>
        )}
        <input
          id={inputId}
          className={`
            w-full rounded-xl bg-zinc-950/70 border border-zinc-800
            px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600
            transition-all duration-200
            hover:border-zinc-700 focus:border-accent-500/80 focus:ring-1 focus:ring-accent-500/30
            focus:outline-none font-sans
            disabled:opacity-50 disabled:cursor-not-allowed
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-[11px] text-zinc-500 font-sans">{hint}</p>}
      {error && <p className="text-[11px] text-rose-400 font-sans">{error}</p>}
    </div>
  );
}

/* ─── Select ──────────────────────────────────────────── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, hint, options, className = '', id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-bold text-zinc-400 tracking-wide font-display">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full rounded-xl bg-zinc-950/70 border border-zinc-800
          px-3.5 py-2.5 text-xs text-zinc-100 font-sans
          transition-all duration-200
          hover:border-zinc-700 focus:border-accent-500/80 focus:ring-1 focus:ring-accent-500/30
          focus:outline-none appearance-none cursor-pointer
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-[11px] text-zinc-500 font-sans">{hint}</p>}
    </div>
  );
}

/* ─── Toggle Switch ──────────────────────────────────────── */
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out
          disabled:opacity-50 disabled:cursor-not-allowed
          ${checked ? 'bg-accent-600' : 'bg-zinc-700'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
      {(label || description) && (
        <div className="flex-1">
          {label && <p className="text-sm font-medium text-zinc-200">{label}</p>}
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        </div>
      )}
    </div>
  );
}
