'use client';
import './globals.css';
import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ListTodo,
  ClipboardList,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';

/** Tipos que recibiremos desde el calendario */
type ViewId = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'multiMonthYear';
type CalendarMeta = { view: ViewId; title: string; start: Date; end: Date };

type CalendarProps = {
  /** El calendario nos avisará cuando cambie de vista o rango */
  onViewChange?: (meta: CalendarMeta) => void;
};

// IMPORTA TU CALENDARIO (ajusta la ruta si es necesario)
const Calendar = dynamic<CalendarProps>(
  () => import('@/components/Calendar').then((m) => m.default ?? m),
  { ssr: false },
);

type NavItem = { href: string; label: string; icon: React.ReactNode; active?: boolean };

const NAV: NavItem[] = [
  { href: '/', label: 'Calendario', icon: <CalendarIcon className="h-4 w-4" />, active: true },
  { href: '/tasks', label: 'Tareas', icon: <ListTodo className="h-4 w-4" /> },
  { href: '/requests', label: 'Solicitudes', icon: <ClipboardList className="h-4 w-4" /> },
  // 👇 Quitamos “Reportes” mientras trabajamos
  // { href: '/reports', label: 'Reportes', icon: <BarChart3 className="h-4 w-4" /> },
  { href: '/settings', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
];

export default function DashboardHomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // Estado que refleja la vista actual del calendario (día/semana/mes/año)
  const [calMeta, setCalMeta] = useState<CalendarMeta>({
    view: 'timeGridWeek',
    title: '',
    start: new Date(),
    end: new Date(),
  });

  // Tema persistente
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    const isDark = saved ? saved === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
    setDark(isDark);
  }, []);
  const toggleTheme = () => {
    setDark((d) => {
      const nd = !d;
      document.documentElement.classList.toggle('dark', nd);
      localStorage.setItem('theme', nd ? 'dark' : 'light');
      return nd;
    });
  };

  // Clases reutilizables
  const linkClass = (active?: boolean) =>
    [
      'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
      active
        ? 'bg-slate-900 text-white'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    ].join(' ');

  // Etiquetas para tarjetas según la vista del calendario
  const scopeWord = useMemo(() => {
    switch (calMeta.view) {
      case 'timeGridDay':
        return 'Hoy';
      case 'timeGridWeek':
        return 'Esta semana';
      case 'dayGridMonth':
        return 'Este mes';
      case 'multiMonthYear':
        return 'Este año';
      default:
        return '';
    }
  }, [calMeta.view]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Layout principal */}
      <div className="flex">
        {/* Sidebar desktop */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-slate-900 dark:bg-slate-100" />
            <div className="text-lg font-semibold">Agenda Inteligente</div>
          </div>

          <nav className="space-y-1">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass(item.active)}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* 👇 Quitamos “Consejo” mientras trabajamos */}
          {/* <div className="mt-8 rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <p className="font-semibold mb-1">Consejo</p>
            <p>Pulsa “Crear” en el calendario para añadir eventos, tareas o solicitudes.</p>
          </div> */}
        </aside>

        {/* Drawer móvil */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-slate-900 dark:bg-slate-100" />
                  <div className="text-lg font-semibold">Agenda</div>
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="space-y-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={linkClass(item.active)}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Columna derecha (header + main + footer) */}
        <div className="flex min-h-screen grow flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/70 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* 👇 Quitamos buscador y notificaciones */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                  onClick={toggleTheme}
                  aria-label="Cambiar tema"
                  title="Cambiar tema"
                >
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <div className="ml-1 h-8 w-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 dark:from-slate-600 dark:to-slate-400" />
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="mx-auto w-full max-w-7xl grow px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            {/* Tarjetas métricas: quitamos “Solicitudes” y títulos dinámicos según vista */}
            <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">
                  {scopeWord} eventos programados
                </p>
                <p className="mt-1 text-2xl font-semibold">0</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">
                  {scopeWord} tareas
                </p>
                <p className="mt-1 text-2xl font-semibold">0</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">Productividad</p>
                <p className="mt-1 text-2xl font-semibold">—</p>
              </div>
            </section>

            {/* Calendario (nos notifica la vista actual) */}
            <section>
              <Calendar
                onViewChange={(meta) => setCalMeta(meta)}
              />
            </section>
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <span>© {new Date().getFullYear()} Agenda Inteligente</span>
              <span className="hidden sm:inline">Hecho con Next.js, React y Tailwind</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
