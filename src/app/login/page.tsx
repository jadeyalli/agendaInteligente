'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isRegister = mode === 'register';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setError('El correo debe incluir un @.');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: trimmedEmail,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'Ocurrió un error.');
        return;
      }

      setSuccess(typeof data?.message === 'string' ? data.message : 'Operación exitosa.');
      router.push('/dashboard');
    } catch (submitError) {
      console.error(submitError);
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--fg)]">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-400 text-base font-semibold text-white shadow-sm">
            AI
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Agenda</p>
            <p className="text-lg font-semibold">Inteligente</p>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-200/70 bg-white/80 p-10 shadow-sm backdrop-blur-sm">
          <div className="space-y-3 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700">
              {isRegister ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">
                {isRegister ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
              </h1>
              <p className="text-sm text-[var(--muted)]">
                {isRegister
                  ? 'Registra tu nombre, correo y contraseña para comenzar.'
                  : 'Ingresa tus credenciales para acceder a Agenda Inteligente.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900/5 p-1 text-sm font-medium text-[var(--muted)]">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-2xl px-4 py-2 transition ${
                !isRegister ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-[var(--fg)]'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-2xl px-4 py-2 transition ${
                isRegister ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-[var(--fg)]'
              }`}
            >
              Crear cuenta
            </button>
          </div>

          <form className="space-y-6" noValidate onSubmit={handleSubmit}>
            {isRegister && (
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-[var(--fg)]">
                  Nombre
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tu nombre"
                  className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--fg)] shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-[var(--fg)]">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--fg)] shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--fg)]">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--fg)] shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                required
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
            )}

            {success && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-600">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Procesando…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-[var(--muted)]">
        <p>© {new Date().getFullYear()} Agenda Inteligente · Organización simple para tu equipo</p>
      </footer>
    </div>
  );
}
