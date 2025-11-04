'use client';

import { forwardRef } from 'react';

type EmailFieldProps = {
  label?: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const EmailField = forwardRef<HTMLInputElement, EmailFieldProps>(
  ({ label = 'Correo electrónico', error, className = '', disabled, id, name = 'email', ...props }, ref) => {
    const inputId = id ?? name;
    const classes = [
      'w-full rounded-xl border px-3 py-2 text-base text-[var(--fg)] shadow-sm transition',
      'border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40',
      'placeholder:text-slate-400',
      disabled ? 'cursor-not-allowed opacity-60' : '',
      error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-semibold text-[var(--fg)]">
          {label}
        </label>
        <input
          {...props}
          id={inputId}
          ref={ref}
          name={name}
          type="email"
          disabled={disabled}
          className={classes}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);

EmailField.displayName = 'EmailField';

export default EmailField;
