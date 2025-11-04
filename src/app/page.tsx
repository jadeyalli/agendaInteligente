'use client';
import './globals.css';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ListTodo,
  ClipboardList,
  Settings,
  Menu,
  X,
  Palette,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import { type ThemeKey, currentTheme, applyTheme } from '@/theme/themes';

/** Tipos que recibiremos desde el calendario */
type ViewId = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'multiMonthYear';
type CalendarMeta = { view: ViewId; title: string; start: Date; end: Date };

type CalendarProps = {
  onViewChange?: (meta: CalendarMeta) => void;
};

const Calendar = dynamic<CalendarProps>(
  () => import('@/components/Calendar').then((m) => m.default ?? m),
  { ssr: false },
);

type NavItem = { href: string; label: string; icon: React.ReactNode; active?: boolean };

const NAV: NavItem[] = [
  { href: '/', label: 'Calendario', icon: <CalendarIcon className="h-4 w-4" />, active: true },
  { href: '/tasks', label: 'Tareas', icon: <ListTodo className="h-4 w-4" /> },
  { href: '/requests', label: 'Solicitudes', icon: <ClipboardList className="h-4 w-4" /> },
  { href: '/settings', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
];

export default function DashboardHomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // === Tema ===
  const [theme, setTheme] = useState<ThemeKey>(currentTheme());
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Meta del calendario (para tarjetas)
  const [calMeta, setCalMeta] = useState<CalendarMeta>({
    view: 'timeGridWeek',
    title: '',
    start: new Date(),
    end: new Date(),
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [desktopCollapsed]);

  const linkClass = (active?: boolean) =>
    [
      'flex items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200',
      active
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--fg)]',
    ].join(' ');

  const sidebarDesktopClass = [
    'hidden lg:flex lg:min-h-screen lg:flex-col lg:border-r lg:border-slate-200/70 lg:bg-[var(--surface)]/90 lg:px-6 lg:pt-6 lg:pb-6 lg:shadow-sm',
    'transition-[margin,width,opacity] duration-300 ease-in-out',
    desktopCollapsed
      ? 'lg:w-0 lg:-ml-10 lg:opacity-0 lg:overflow-hidden'
      : 'lg:w-72 lg:opacity-100 lg:overflow-y-auto lg:pb-32',
  ].join(' ');

  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
      style={{ '--app-header-height': '72px' } as React.CSSProperties}
    >
      <div className="flex min-h-screen">
        <aside aria-label="Menú lateral" className={sidebarDesktopClass}>
          <div className="flex grow flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-400 text-base font-semibold text-white shadow-sm">
                AI
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Agenda</p>
                <p className="text-base font-semibold text-[var(--fg)]">Panel principal</p>
              </div>
            </div>

            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.active)}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/5 text-slate-600">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <aside className="absolute left-0 top-0 flex h-full w-72 flex-col gap-6 border-r border-slate-200 bg-[var(--surface)] px-5 py-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-400 text-sm font-semibold text-white">
                    AI
                  </div>
                  <span className="text-base font-semibold text-[var(--fg)]">Agenda</span>
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/70 bg-white/60 text-[var(--muted)] transition hover:bg-white"
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
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900/5 text-slate-600">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4">
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--fg)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:text-[var(--fg)] lg:inline-flex"
                  onClick={() => setDesktopCollapsed((prev) => !prev)}
                  aria-label={desktopCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
                >
                  {desktopCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Agenda Inteligente</p>
                  <p className="text-lg font-semibold leading-tight text-[var(--fg)]">Panel de organización</p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <div className="hidden items-center rounded-full border border-slate-200/60 bg-white/70 px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm sm:flex">
                  <span className="truncate">{calMeta.title || ' '}</span>
                </div>
                <div className="relative">
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as ThemeKey)}
                    aria-label="Seleccionar tema"
                    className="appearance-none rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 pr-9 text-sm font-medium text-[var(--fg)] shadow-sm transition hover:bg-white"
                    title="Tema"
                  >
                    <option value="pastel">Pastel</option>
                    <option value="funny">Funny</option>
                    <option value="cool">Cool</option>
                    <option value="autumn">Autumn</option>
                    <option value="mono">Mono</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Palette className="h-4 w-4" />
                  </span>
                </div>
                <div className="ml-1 h-10 w-10 rounded-full bg-gradient-to-br from-slate-300 via-slate-200 to-slate-500 shadow-inner" />
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:pb-28">
            <Calendar onViewChange={(meta) => setCalMeta(meta)} />
          </main>

          <footer
            className="mt-auto border-t border-slate-200/60 bg-[var(--surface)]/80 px-4 py-4 text-sm text-[var(--muted)] lg:fixed lg:bottom-0 lg:left-0 lg:right-0 lg:z-30 lg:mt-0"
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{new Date().getFullYear()} · Agenda Inteligente</span>
              <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Organiza tu día con claridad</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
