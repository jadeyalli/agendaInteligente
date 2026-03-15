'use client';

import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Clock3 } from 'lucide-react';

import {
  buildWaitlistGroups,
  KIND_LABELS,
  WAITLIST_WINDOW_LABELS,
  type EventRow,
} from '@/lib/waitlist-utils';
import { isoToDate, dateToTimeStringLocal } from '@/lib/timezone';

/* ── helpers ── */
function formatDate(value: string | null | undefined, tz: string): string | null {
  if (!value) return null;
  const d = isoToDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: tz }).format(d);
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
      const endTime = dateToTimeStringLocal(e, tz) ?? '';
      if (d.toDateString() === e.toDateString() && endTime)
        return `${dateLabel} · ${startTime} – ${endTime}`;
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

/* ── props ── */
type Props = {
  open: boolean;
  onClose: () => void;
  rows: EventRow[];
  loading: boolean;
};

export default function WaitlistPanel({ open, onClose, rows, loading }: Props) {
  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  const groups = useMemo(() => buildWaitlistGroups(rows), [rows]);
  const total = groups.reduce((s, g) => s + g.events.length, 0);

  // close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />

          {/* panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Lista de espera"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200/70 bg-[var(--surface)] shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <Clock3 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--fg)]">Lista de espera</h2>
                  {total > 0 && (
                    <p className="text-xs text-[var(--muted)]">{total} evento{total !== 1 ? 's' : ''} pendiente{total !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]"
                aria-label="Cerrar lista de espera"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                </div>
              ) : total === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <Clock3 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--fg)]">Sin eventos en espera</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Los eventos opcionales que crees aparecerán aquí.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  {groups.map((group) => (
                    <section key={group.category}>
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                          {group.category}
                        </h3>
                        <span className="text-xs text-[var(--muted)]">
                          {group.events.length} {group.events.length === 1 ? 'evento' : 'eventos'}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {group.events.map((event) => {
                          const suggestion = formatSuggested(event, tz);
                          const windowText = formatWindow(event, tz);
                          const durationText = formatDuration(event);
                          const kindLabel = KIND_LABELS[event.kind] ?? event.kind;
                          return (
                            <article
                              key={event.id}
                              className="rounded-2xl border border-slate-200/60 bg-white/80 p-3.5 shadow-sm"
                            >
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    {kindLabel}
                                  </span>
                                  {event.category && (
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                                      {event.category}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-[var(--fg)] leading-snug">{event.title}</p>
                                {event.description && (
                                  <p className="text-xs text-[var(--muted)] leading-relaxed line-clamp-2">{event.description}</p>
                                )}
                                {(suggestion || windowText || durationText) && (
                                  <div className="space-y-0.5 pt-0.5">
                                    {suggestion && <p className="text-xs text-[var(--muted)]">{suggestion}</p>}
                                    {windowText && <p className="text-xs text-[var(--muted)]">Ventana: {windowText}</p>}
                                    {durationText && <p className="text-xs text-[var(--muted)]">Duración: {durationText}</p>}
                                  </div>
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
            </div>

            {/* footer */}
            <div className="shrink-0 border-t border-slate-200/60 px-5 py-3">
              <p className="text-xs text-[var(--muted)]">
                Eventos opcionales pendientes de agendar.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
