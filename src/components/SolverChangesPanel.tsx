'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, X, ArrowRight, AlertCircle, Clock } from 'lucide-react';

export interface SolverPlaced {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface SolverMoved {
  id: string;
  title: string;
  fromStart: string | null;
  fromEnd: string | null;
  toStart: string;
  toEnd: string;
  reason: string;
}

export interface SolverUnplaced {
  id: string;
  title: string;
  reason: string;
}

export interface SolverChanges {
  placed: SolverPlaced[];
  moved: SolverMoved[];
  unplaced: SolverUnplaced[];
}

interface SolverChangesPanelProps {
  isVisible: boolean;
  changes: SolverChanges;
  onAccept: () => void;
  onCancel: () => void;
  accepting?: boolean;
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Panel persistente que muestra los cambios propuestos por el solver.
 * Los cambios NO se persisten en la BD hasta que el usuario presione "Aceptar".
 */
export default function SolverChangesPanel({
  isVisible,
  changes,
  onAccept,
  onCancel,
  accepting = false,
}: SolverChangesPanelProps) {
  const totalChanges = changes.placed.length + changes.moved.length + changes.unplaced.length;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="rounded-3xl border border-indigo-200/80 bg-indigo-50/80 p-5 shadow-sm backdrop-blur"
        >
          {/* Cabecera */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-indigo-900">
                Propuesta de re-optimizacion
              </h2>
              <p className="mt-0.5 text-sm text-indigo-700">
                El solver propone {totalChanges} cambio{totalChanges !== 1 ? 's' : ''} en tu agenda.
                Revisa y acepta o cancela.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={accepting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                type="button"
                onClick={onAccept}
                disabled={accepting || totalChanges === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {accepting ? 'Aplicando…' : 'Aceptar cambios'}
              </button>
            </div>
          </div>

          {totalChanges === 0 ? (
            <p className="text-sm text-indigo-600">
              La agenda ya esta optimizada. No hay cambios pendientes.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Eventos colocados */}
              {changes.placed.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                    Nuevos eventos agendados ({changes.placed.length})
                  </h3>
                  <div className="space-y-1.5">
                    {changes.placed.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm"
                      >
                        <Clock className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="min-w-0 flex-1 truncate font-medium text-emerald-900">
                          {ev.title}
                        </span>
                        <span className="shrink-0 text-xs text-emerald-700">
                          {fmtDatetime(ev.start)} – {fmtTime(ev.end)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Eventos movidos */}
              {changes.moved.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                    Eventos reubicados ({changes.moved.length})
                  </h3>
                  <div className="space-y-1.5">
                    {changes.moved.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-medium text-amber-900">
                            {ev.title}
                          </span>
                          {ev.reason && (
                            <span className="shrink-0 text-[11px] text-amber-600">
                              {ev.reason}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-amber-700">
                          <span className="line-through opacity-70">
                            {fmtDatetime(ev.fromStart)}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span className="font-medium">
                            {fmtDatetime(ev.toStart)} – {fmtTime(ev.toEnd)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Eventos sin espacio */}
              {changes.unplaced.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                    Sin espacio disponible ({changes.unplaced.length})
                  </h3>
                  <div className="space-y-1.5">
                    {changes.unplaced.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span className="min-w-0 flex-1 truncate font-medium text-rose-900">
                          {ev.title}
                        </span>
                        <span className="shrink-0 text-xs text-rose-600">{ev.reason}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
