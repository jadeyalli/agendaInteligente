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
} from 'lucide-react';

import { THEMES, type ThemeKey, currentTheme, applyTheme } from '@/theme/themes';

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

  // === Tema ===
  const [theme, setTheme] = useState<ThemeKey>(currentTheme());
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Meta del calendario (para tarjetas)
  const [, setCalMeta] = useState<CalendarMeta>({
    view: 'timeGridWeek',
    title: '',
    start: new Date(),
    end: new Date(),
  });

  const linkClass = (active?: boolean) =>
    [
      'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
      active
        ? 'bg-slate-900 text-white'
        : 'text-slate-700 hover:bg-slate-100',
    ].join(' ');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      {/* Layout principal */}
      <div className="flex items-start">
        {/* Sidebar desktop (STICKY) */}
        <aside
          aria-label="Menú lateral"
          className="hidden lg:block lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto w-64 shrink-0 border-r border-slate-200 bg-[var(--surface)] p-4"
        >
          <div className="mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-slate-900" />
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
        </aside>

        {/* Drawer móvil */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-slate-200 bg-[var(--surface)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-slate-900" />
                  <div className="text-lg font-semibold">Agenda</div>
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
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
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-[var(--surface)] px-4 py-2 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Selector de tema (reemplaza dark-mode) */}
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as ThemeKey)}
                    aria-label="Seleccionar tema"
                    className="appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm text-slate-800 hover:bg-slate-50"
                    title="Tema"
                  >
                    <option value="pastel">Pastel</option>
                    <option value="funny">Funny</option>
                    <option value="cool">Cool</option>
                    <option value="autumn">Autumn</option>
                    <option value="mono">Mono</option>
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
                    <Palette className="h-4 w-4" />
                  </span>
                </div>
                <div className="ml-1 h-8 w-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-500" />
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="mx-auto w-full max-w-7xl grow px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <Calendar onViewChange={(meta) => setCalMeta(meta)} />
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-slate-200 bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <span>{new Date().getFullYear()} Agenda Inteligente</span>
              <span className="hidden sm:inline">Incremento 1 - :)</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
