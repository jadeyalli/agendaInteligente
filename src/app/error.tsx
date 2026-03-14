'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-[var(--fg)]">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-rose-400">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-[var(--muted)]">Error 500</p>
        <h1 className="text-3xl font-semibold">Algo salió mal</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Ocurrió un error inesperado. Puedes intentar de nuevo o volver al inicio.
        </p>
        {error.digest && (
          <p className="text-xs text-[var(--muted)] opacity-60">
            Ref: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/dashboard"
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-[var(--fg)] transition hover:-translate-y-0.5 hover:border-slate-300"
        >
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
