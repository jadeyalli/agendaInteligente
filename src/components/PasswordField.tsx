'use client';

import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordFieldProps = {
  label?: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label = 'Contraseña', error, className = '', disabled, id, name = 'password', ...props }, ref) => {
    const [visible, setVisible] = useState(false);
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
        <div className="relative">
          <input
            {...props}
            id={inputId}
            ref={ref}
            name={name}
            type={visible ? 'text' : 'password'}
            disabled={disabled}
            className={`${classes} pr-12`}
          />
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className="absolute inset-y-0 right-2 flex items-center rounded-lg px-2 text-slate-500 transition hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            tabIndex={-1}
            disabled={disabled}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  },
);

PasswordField.displayName = 'PasswordField';

export default PasswordField;
