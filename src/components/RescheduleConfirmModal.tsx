'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight, CalendarCheck } from 'lucide-react';

interface MovedEvent {
  id: string;
  title: string;
  fromStart: string | null;
  toStart: string;
}

interface PlacedEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface Props {
  isOpen: boolean;
  movedEvents: MovedEvent[];
  placedEvents: PlacedEvent[];
  onAccept: () => void;
  onCancel: () => void;
}

/** Formatea un ISO string a fecha y hora legible. */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Modal que muestra al usuario qué eventos se moverán antes de aplicar
 * el resultado del solver. Cumple la regla de transparencia en reagendamiento
 * (§5.3 del documento técnico): el usuario acepta o cancela antes de persistir.
 */
export default function RescheduleConfirmModal({
  isOpen,
  movedEvents,
  placedEvents,
  onAccept,
  onCancel,
}: Props) {
  const totalChanges = movedEvents.length + placedEvents.length;

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
            onClick={onCancel}
            aria-hidden
          />

          {/* modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar reagendamiento"
            className="fixed inset-x-4 top-[50%] z-50 w-full max-w-lg translate-y-[-50%] rounded-2xl bg-[var(--surface)] shadow-xl sm:inset-x-auto sm:left-[50%] sm:translate-x-[-50%]"
            initial={{ opacity: 0, scale: 0.95, y: '-48%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, y: '-48%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            {/* encabezado */}
            <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--fg)]">Confirmar reagendamiento</h2>
                  <p className="text-xs text-[var(--muted)]">
                    {totalChanges} cambio{totalChanges !== 1 ? 's' : ''} pendiente{totalChanges !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onCancel}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* cuerpo */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4">
              {placedEvents.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Eventos nuevos agendados
                  </h3>
                  <div className="space-y-2">
                    {placedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5"
                      >
                        <p className="text-sm font-medium text-[var(--fg)]">{ev.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {fmtDateTime(ev.start)} – {fmtDateTime(ev.end)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {movedEvents.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Eventos que se moverán
                  </h3>
                  <div className="space-y-2">
                    {movedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5"
                      >
                        <p className="text-sm font-medium text-[var(--fg)]">{ev.title}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                          <span className="line-through opacity-60">{fmtDateTime(ev.fromStart)}</span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span>{fmtDateTime(ev.toStart)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {totalChanges === 0 && (
                <p className="py-4 text-center text-sm text-[var(--muted)]">
                  No hay cambios pendientes.
                </p>
              )}
            </div>

            {/* acciones */}
            <div className="flex justify-end gap-3 border-t border-slate-200/60 px-6 py-4">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-[var(--fg)] transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Aceptar cambios
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
