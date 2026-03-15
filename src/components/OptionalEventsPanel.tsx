'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Lightbulb } from 'lucide-react';

/** Evento opcional mínimo que necesita el panel. */
export interface OptionalEventItem {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
}

interface Props {
  events: OptionalEventItem[];
  onScheduleEvent: (eventId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Formatea duración en minutos a texto legible ("1h", "30min", "1h 30min"). */
function formatDuration(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

/**
 * Panel deslizable lateral que lista todos los eventos con prioridad OPCIONAL
 * del usuario. Cada evento tiene un botón "Agendar" para promoverlo a
 * urgente/relevante abriendo el modal de creación pre-llenado.
 */
export default function OptionalEventsPanel({ events, onScheduleEvent, isOpen, onToggle }: Props) {
  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            aria-hidden
          />

          {/* panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Eventos opcionales"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200/70 bg-[var(--surface)] shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* encabezado */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--fg)]">Eventos opcionales</h2>
                  {events.length > 0 && (
                    <p className="text-xs text-[var(--muted)]">
                      {events.length} evento{events.length !== 1 ? 's' : ''} pendiente{events.length !== 1 ? 's' : ''} de agendar
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onToggle}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]"
                aria-label="Cerrar panel de opcionales"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* cuerpo */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {events.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400">
                    <Lightbulb className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--fg)]">Sin eventos opcionales</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Los eventos que crees con prioridad Opcional aparecerán aquí para agendarlos cuando quieras.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--muted)]">
                    Estos eventos están pendientes. Agéndalo cuando estés listo para asignarles una prioridad y horario.
                  </p>
                  {events.map((event) => {
                    const durationText = formatDuration(event.durationMinutes);
                    return (
                      <article
                        key={event.id}
                        className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                                Opcional
                              </span>
                            </div>
                            <p className="text-sm font-semibold leading-snug text-[var(--fg)]">
                              {event.title}
                            </p>
                            {event.description && (
                              <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                                {event.description}
                              </p>
                            )}
                            {durationText && (
                              <p className="text-xs text-[var(--muted)]">Duración: {durationText}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                            onClick={() => onScheduleEvent(event.id)}
                          >
                            Agendar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* pie */}
            <div className="shrink-0 border-t border-slate-200/60 px-5 py-3">
              <p className="text-xs text-[var(--muted)]">
                Al agendar, podrás asignarles prioridad y ventana de tiempo.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
