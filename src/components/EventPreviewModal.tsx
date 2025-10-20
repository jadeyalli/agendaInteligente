'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Trash2, Tag, Flag } from 'lucide-react';
import React from 'react';

export type EventRow = {
  id: string;
  kind: 'EVENTO' | 'TAREA' | 'SOLICITUD';
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO' | null;

  start?: string | null;
  end?: string | null;
  isAllDay?: boolean | null;
  dueDate?: string | null;
};

const badgeByPriority: Record<NonNullable<EventRow['priority']>, string> = {
  CRITICA: 'bg-rose-600 text-white',
  URGENTE: 'bg-amber-500 text-black',
  RELEVANTE: 'bg-blue-600 text-white',
  OPCIONAL: 'bg-slate-500 text-white',
  RECORDATORIO: 'bg-violet-500 text-white',
};

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function EventPreviewModal({
  open,
  event,
  onClose,
  onEdit,
  onDelete,
  deleting = false,
}: {
  open: boolean;
  event: EventRow | null;
  onClose: () => void;
  onEdit: (e: EventRow) => void;
  onDelete: (e: EventRow) => void;
  deleting?: boolean;
}) {
  const priority = event?.priority ?? null;
  const badge =
    priority && badgeByPriority[priority]
      ? badgeByPriority[priority]
      : 'bg-slate-400 text-white';

  const isTask = event?.kind === 'TAREA';

  return (
    <AnimatePresence>
      {open && event && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 250, damping: 24 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-semibold text-slate-900">
                    {event.title}
                  </span>
                  {priority && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${badge}`}>
                      <Flag className="mr-1 h-3 w-3" />
                      {priority}
                    </span>
                  )}
                </div>
                {event.category && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                    <Tag className="h-3 w-3" />
                    <span className="truncate">{event.category}</span>
                  </div>
                )}
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={onClose}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {isTask ? 'Fecha límite' : 'Fecha y hora'}
                  </p>
                  {isTask ? (
                    <p className="text-slate-800">{fmtDateTime(event.dueDate)}</p>
                  ) : (
                    <p className="text-slate-800">
                      {fmtDateTime(event.start)} {event.end ? `— ${fmtDateTime(event.end)}` : ''}
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Descripción
                  </p>
                  <p className="whitespace-pre-wrap text-slate-800">
                    {event.description?.trim() || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              <div className="text-xs text-slate-500">
                {event.kind === 'EVENTO' ? 'Evento' : event.kind === 'TAREA' ? 'Tarea' : 'Solicitud'}
              </div>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => onEdit(event)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-600 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  onClick={() => onDelete(event)}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
