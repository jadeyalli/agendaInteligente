'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';

import EmailField from '@/components/EmailField';
import PasswordField from '@/components/PasswordField';

type LoginFormValues = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const { watch, setValue, handleSubmit, setError, clearErrors, formState } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
  });

  const email = watch('email') ?? '';
  const password = watch('password') ?? '';
  const { errors, isSubmitting } = formState;

  const rootError = useMemo(() => errors.root?.message, [errors.root?.message]);

  const onSubmit = handleSubmit(async (values) => {
    clearErrors();

    let hasErrors = false;
    if (!values.email) {
      setError('email', { message: 'El correo es obligatorio' });
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setError('email', { message: 'Ingresa un correo válido' });
      hasErrors = true;
    }

    if (!values.password) {
      setError('password', { message: 'La contraseña es obligatoria' });
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    const result = await signIn('credentials', {
      redirect: false,
      email: values.email,
      password: values.password,
      callbackUrl,
    });

    if (result?.error) {
      setError('root', { message: 'Correo o contraseña incorrectos' });
      return;
    }

    router.push(result?.url ?? callbackUrl);
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12 text-[var(--fg)]">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-[var(--surface)] p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold">Inicia sesión</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Usa tus credenciales para acceder a tu agenda inteligente.
            </p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <EmailField
              name="email"
              value={email}
              onChange={(value) => {
                clearErrors('email');
                setValue('email', value, { shouldValidate: true });
              }}
              placeholder="tu@correo.com"
              autoComplete="email"
              disabled={isSubmitting}
              error={errors.email?.message}
            />

            <PasswordField
              name="password"
              value={password}
              onChange={(value) => {
                clearErrors('password');
                setValue('password', value, { shouldValidate: true });
              }}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isSubmitting}
              error={errors.password?.message}
            />

            {rootError && <p className="text-sm text-red-600">{rootError}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Verificando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
