import Link from 'next/link';
import { CalendarDays, CheckSquare, Sparkles, ArrowRight, Timer } from 'lucide-react';

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
    title: 'Planificación dinámica',
    description:
      'El sistema reajusta automáticamente tus eventos para aprovechar tu disponibilidad real sin perder el foco.',
    icon: <Sparkles className="h-5 w-5" />,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="animate-gradient-slow absolute -top-1/3 left-1/2 h-[60rem] w-[60rem] rounded-full bg-gradient-to-br from-sky-300/60 via-purple-200/40 to-indigo-300/60 blur-3xl" />
        <div className="animate-float-slow absolute bottom-[-18rem] left-[10%] h-[32rem] w-[32rem] rounded-full bg-gradient-to-t from-indigo-200/30 via-sky-200/40 to-transparent blur-3xl" />
        <div className="animate-float-slower absolute right-[-12rem] top-1/4 h-[28rem] w-[28rem] rounded-full bg-gradient-to-bl from-purple-200/40 via-emerald-200/30 to-transparent blur-3xl" />
      </div>
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 pb-20 pt-10">
        <section className="space-y-8 text-center animate-fade-up">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/70 shadow-lg backdrop-blur-sm">
            <Timer className="h-5 w-5 text-slate-600" />
          </div>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Planea tu semana con claridad y sin complicaciones.
          </h1>
          <p className="mx-auto max-w-3xl text-base text-[var(--muted)] sm:text-lg">
            Agenda Inteligente es una plataforma digital que optimiza la gestión del tiempo mediante priorización cognitiva y programación inteligente.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Comenzar ahora
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm backdrop-blur-sm sm:grid-cols-3 animate-fade-up-slow">
          {FEATURES.map((feature, index) => (
            <article
              key={feature.title}
              className="group space-y-4 text-left animate-fade-up transition duration-500 ease-out hover:-translate-y-2 hover:shadow-xl"
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 text-slate-600 transition duration-500 group-hover:bg-slate-900 group-hover:text-white">
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
      </footer>
    </div>
  );
}
