import Link from 'next/link';
import { CalendarX2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-[var(--fg)]">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
        <CalendarX2 className="h-10 w-10" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-[var(--muted)]">Error 404</p>
        <h1 className="text-3xl font-semibold">Página no encontrada</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Ir al panel
        </Link>
        <Link
          href="/"
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-[var(--fg)] transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          Inicio
        </Link>
      </div>
    </div>
  );
}
