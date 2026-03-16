'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Clock, FileText, Calendar } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modal para crear un bloque fantasma manual (reservar espacio en la agenda).
 * El bloque bloquea capacidad para el solver sin crear un evento real.
 */
export default function ReserveSpaceModal({ open, onClose, onCreated }: Props) {
  const [date, setDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeOrderError =
    timeStart && timeEnd && timeEnd <= timeStart
      ? 'La hora de fin debe ser posterior a la hora de inicio.'
      : null;

  const canSubmit =
    Boolean(date) &&
    Boolean(timeStart) &&
    Boolean(timeEnd) &&
    timeOrderError === null;

  function reset() {
    setDate('');
    setTimeStart('');
    setTimeEnd('');
    setTitle('');
    setReason('');
    setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const start = new Date(`${date}T${timeStart}`);
      const end = new Date(`${date}T${timeEnd}`);
      const res = await fetch('/api/collaborative/phantom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, title: title.trim() || undefined, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'No se pudo reservar el espacio.');
      }
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al reservar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Reservar espacio"
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: 20, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Reservar espacio</h2>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                onClick={onClose}
                aria-label="Cerrar"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="text-xs text-slate-500">
                Reserva un bloque de tiempo en tu agenda. El solver lo tratará como ocupado y no agendará otros eventos encima.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />Fecha
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />Hora inicio
                  </label>
                  <input type="time" step="300" value={timeStart} onChange={(e) => setTimeStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />Hora fin
                  </label>
                  <input type="time" step="300" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60" />
                </div>
              </div>
              {timeOrderError && <p className="text-xs text-red-500">{timeOrderError}</p>}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Título (opcional)
                </label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Espacio reservado"
                  maxLength={100}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />Motivo (opcional)
                </label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Opcional"
                  maxLength={300}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/60" />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={onClose}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={handleSubmit} disabled={!canSubmit || saving}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {saving ? 'Reservando…' : 'Reservar'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
