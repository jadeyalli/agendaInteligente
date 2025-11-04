import Link from 'next/link';
import { ArrowLeft, LogIn } from 'lucide-react';

export default function LoginPage() {
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
              <LogIn className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Bienvenido de nuevo</h1>
              <p className="text-sm text-[var(--muted)]">Ingresa tus credenciales para acceder al panel de Agenda Inteligente.</p>
            </div>
          </div>

          <form className="space-y-6" noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-[var(--fg)]">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.com"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--fg)] shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--fg)]">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-[var(--fg)] shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-[var(--muted)]">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-200" />
                Recuérdame
              </label>
              <button type="button" className="font-medium text-slate-600 transition hover:text-slate-800">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <button
              type="submit"
              className="w-full rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Ingresar
            </button>
          </form>

          <p className="text-center text-xs text-[var(--muted)]">
            ¿Aún no tienes cuenta? <span className="font-medium text-slate-700">Solicita acceso a tu administrador.</span>
          </p>
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-[var(--muted)]">
        <p>© {new Date().getFullYear()} Agenda Inteligente · Organización simple para tu equipo</p>
      </footer>
    </div>
  );
}
