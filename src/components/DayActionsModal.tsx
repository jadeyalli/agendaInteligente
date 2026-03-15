'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Trash2, Pin, PinOff, CheckCircle, Circle, CalendarDays } from 'lucide-react';

interface DayEvent {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  priority: string;
  category: string | null;
  isFixed: boolean;
  completed: boolean;
}

interface Props {
  isOpen: boolean;
  date: Date;
  events: DayEvent[];
  onClose: () => void;
  onEdit: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onToggleFixed: (eventId: string) => void;
  onToggleCompleted: (eventId: string) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  CRITICA: 'Crítica',
  URGENTE: 'Urgente',
  RELEVANTE: 'Relevante',
  OPCIONAL: 'Opcional',
  RECORDATORIO: 'Recordatorio',
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICA: 'bg-rose-100 text-rose-700',
  URGENTE: 'bg-amber-100 text-amber-700',
  RELEVANTE: 'bg-blue-100 text-blue-700',
  OPCIONAL: 'bg-teal-100 text-teal-700',
  RECORDATORIO: 'bg-violet-100 text-violet-700',
};

/** Formatea una fecha a "Lunes 16 de marzo de 2026". */
function fmtDayHeader(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Formatea una hora como "09:00". */
function fmtTime(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Modal de lista de eventos de un día específico con acciones rápidas por evento.
 * Se abre al hacer clic en el botón de acciones del día en el encabezado del calendario.
 */
export default function DayActionsModal({
  isOpen,
  date,
  events,
  onClose,
  onEdit,
  onDelete,
  onToggleFixed,
  onToggleCompleted,
}: Props) {
  const sorted = [...events].sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start.getTime() - b.start.getTime();
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />

          {/* modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Acciones del día"
            className="fixed inset-x-4 top-[50%] z-50 w-full max-w-lg translate-y-[-50%] rounded-2xl bg-[var(--surface)] shadow-xl sm:inset-x-auto sm:left-[50%] sm:translate-x-[-50%]"
            initial={{ opacity: 0, scale: 0.95, y: '-48%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, y: '-48%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            {/* encabezado */}
            <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold capitalize text-[var(--fg)]">
                    {fmtDayHeader(date)}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    {sorted.length === 0
                      ? 'Sin eventos'
                      : `${sorted.length} evento${sorted.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* cuerpo */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
              {sorted.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CalendarDays className="h-10 w-10 text-slate-300" />
                  <p className="text-sm text-[var(--muted)]">No hay eventos para este día.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sorted.map((event) => {
                    const badgeClass = PRIORITY_BADGE[event.priority] ?? 'bg-slate-100 text-slate-600';
                    const priorityLabel = PRIORITY_LABELS[event.priority] ?? event.priority;
                    return (
                      <div
                        key={event.id}
                        className={[
                          'rounded-xl border border-slate-200/70 bg-white/70 p-3',
                          event.completed ? 'opacity-55' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          {/* hora */}
                          <div className="w-12 shrink-0 pt-0.5 text-xs font-medium text-[var(--muted)]">
                            {fmtTime(event.start)}
                            {event.end && (
                              <div className="text-[10px] opacity-70">{fmtTime(event.end)}</div>
                            )}
                          </div>

                          {/* contenido */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                                {priorityLabel}
                              </span>
                              {event.category && (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                                  {event.category}
                                </span>
                              )}
                              {event.isFixed && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                  Fijado
                                </span>
                              )}
                            </div>
                            <p className={['text-sm font-semibold text-[var(--fg)]', event.completed ? 'line-through' : ''].join(' ')}>
                              {event.title}
                            </p>
                          </div>

                          {/* acciones */}
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title={event.completed ? 'Marcar pendiente' : 'Marcar completado'}
                              onClick={() => onToggleCompleted(event.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-slate-100 hover:text-emerald-600"
                            >
                              {event.completed
                                ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                                : <Circle className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              title={event.isFixed ? 'Desfijar' : 'Fijar'}
                              onClick={() => onToggleFixed(event.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-slate-100 hover:text-indigo-600"
                            >
                              {event.isFixed
                                ? <PinOff className="h-4 w-4" />
                                : <Pin className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => onEdit(event.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-slate-100 hover:text-blue-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Eliminar"
                              onClick={() => onDelete(event.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
