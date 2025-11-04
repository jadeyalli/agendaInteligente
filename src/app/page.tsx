import Link from 'next/link';
import { CalendarDays, CheckSquare, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

const FEATURES = [
  {
    title: 'Agenda centralizada',
    description: 'Visualiza reuniones, recordatorios y entregables en un mismo lugar para mantener el control de tu semana.',
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    title: 'Prioridades claras',
    description: 'Clasifica tus pendientes por impacto y urgencia con una estética limpia que evita distracciones.',
    icon: <CheckSquare className="h-5 w-5" />,
  },
  {
    title: 'Asistente inteligente',
    description: 'Recibe recomendaciones simples para equilibrar tu carga laboral y proteger tus espacios personales.',
    icon: <Sparkles className="h-5 w-5" />,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-400 text-base font-semibold text-white shadow-sm">
            AI
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Agenda</p>
            <p className="text-lg font-semibold">Inteligente</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/dashboard"
            className="hidden items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 sm:inline-flex"
          >
            Ir al panel
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pb-20 pt-10">
        <section className="space-y-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.28em] text-[var(--muted)]">
            <ShieldCheck className="h-4 w-4" />
            Organización tranquila
          </div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Planea tu semana con claridad y sin complicaciones.
          </h1>
          <p className="mx-auto max-w-3xl text-base text-[var(--muted)] sm:text-lg">
            Agenda Inteligente reúne tus compromisos, tareas y recordatorios en una experiencia minimalista que prioriza lo importante. Diseñada para equipos que necesitan coordinación, sin sacrificar simplicidad.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Comenzar ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-6 py-3 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
            >
              Ver demostración
            </Link>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur-sm sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="space-y-4 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 text-slate-600">
                {feature.icon}
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{feature.title}</h2>
                <p className="text-sm text-[var(--muted)]">{feature.description}</p>
              </div>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-slate-200/60 bg-white/70 px-6 py-6 text-center text-sm text-[var(--muted)]">
        <p className="font-medium">{new Date().getFullYear()} · Agenda Inteligente</p>
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Tu rutina con intención</p>
      </footer>
    </div>
  );
}
