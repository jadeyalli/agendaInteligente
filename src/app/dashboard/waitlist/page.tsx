'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock3 } from 'lucide-react';

import { applyTheme, currentTheme } from '@/theme/themes';
import {
  buildWaitlistGroups,
  KIND_LABELS,
  WAITLIST_WINDOW_LABELS,
  type EventRow,
} from '@/lib/waitlist-utils';
import { isoToDate, dateToTimeStringLocal } from '@/lib/timezone';

function formatDate(value: string | null | undefined, tz: string, time = false): string | null {
  if (!value) return null;
  const d = isoToDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    ...(time ? { timeStyle: 'short' } : {}),
    timeZone: tz,
  }).format(d);
}

function formatSuggested(event: EventRow, tz: string): string | null {
  if (!event.start) return null;
  const d = isoToDate(event.start);
  if (!d) return null;
  if (event.isAllDay) return formatDate(event.start, tz);
  const dateLabel = formatDate(event.start, tz) ?? '';
  const startTime = dateToTimeStringLocal(d, tz) ?? '';
  if (event.end) {
    const e = isoToDate(event.end);
    if (e) {
      const sameDay = d.toDateString() === e.toDateString();
      const endTime = dateToTimeStringLocal(e, tz) ?? '';
      if (sameDay && endTime) return `${dateLabel} · ${startTime} – ${endTime}`;
    }
  }
  return startTime ? `${dateLabel} · ${startTime}` : dateLabel;
}

function formatWindow(event: EventRow, tz: string): string | null {
  const code = event.window && event.window !== 'NONE' ? event.window : null;
  if (!code) return null;
  if (code === 'RANGO') {
    const s = formatDate(event.windowStart, tz);
    const e = formatDate(event.windowEnd, tz);
    if (s && e) return `${s} – ${e}`;
    return s ?? e ?? null;
  }
  return WAITLIST_WINDOW_LABELS[code] ?? null;
}

function formatDuration(event: EventRow): string | null {
  if (!event.durationMinutes) return null;
  const h = Math.floor(event.durationMinutes / 60);
  const m = event.durationMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export default function WaitlistPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tz = typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC';

  useEffect(() => {
    applyTheme(currentTheme());
    fetch('/api/events')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => buildWaitlistGroups(rows), [rows]);
  const total = groups.reduce((s, g) => s + g.events.length, 0);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8 space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-indigo-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al panel
          </Link>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold text-[var(--fg)] sm:text-3xl">Lista de espera</h1>
            {total > 0 && (
              <span className="rounded-full bg-slate-900/10 px-3 py-0.5 text-sm font-semibold text-slate-700">
                {total}
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--muted)]">
            Eventos opcionales y sugerencias pendientes de agendar.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Clock3 className="h-8 w-8" />
            </div>
            <div>
              <p className="font-semibold text-[var(--fg)]">Sin eventos en espera</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Cuando agregues eventos opcionales o sugerencias, aparecerán aquí.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="mt-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Ir al calendario
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.category}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {group.category}
                  </h2>
                  <span className="text-xs font-medium text-[var(--muted)]">
                    {group.events.length} {group.events.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.events.map((event) => {
                    const suggestion = formatSuggested(event, tz);
                    const windowText = formatWindow(event, tz);
                    const durationText = formatDuration(event);
                    const kindLabel = KIND_LABELS[event.kind] ?? event.kind;
                    return (
                      <article
                        key={event.id}
                        className="rounded-2xl border border-slate-200/70 bg-[var(--surface)]/90 p-4 shadow-sm"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                              {kindLabel}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                              Opcional
                            </span>
                            {event.category && (
                              <span className="text-[10px] font-medium text-[var(--muted)]">
                                {event.category}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-[var(--fg)]">{event.title}</h3>
                          {event.description && (
                            <p className="text-xs text-[var(--muted)]">{event.description}</p>
                          )}
                          {(suggestion || windowText || durationText) && (
                            <dl className="space-y-0.5 text-xs text-[var(--muted)]">
                              {suggestion && <dd>{suggestion}</dd>}
                              {windowText && <dd>Ventana: {windowText}</dd>}
                              {durationText && <dd>Duración estimada: {durationText}</dd>}
                            </dl>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
