'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CalendarClock } from 'lucide-react';
import type { AvailableSlot } from '@/components/AvailableSlots';

interface Props {
  isOpen: boolean;
  collabEventId: string;
  durationMin: number;
  availableSlots: AvailableSlot[];
  onClose: () => void;
  onRequested: () => void;
}

/**
 * Modal para que un invitado ESSENTIAL proponga 3 slots alternativos
 * y envíe una solicitud de reagendamiento al anfitrión.
 */
export default function RescheduleRequestModal({
  isOpen,
  collabEventId,
  durationMin,
  availableSlots,
  onClose,
  onRequested,
}: Props) {
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleSlots = availableSlots.filter(
    (s) => Math.round((s.end.getTime() - s.start.getTime()) / 60000) === durationMin,
  );

  function toggleSlot(idx: number) {
    setSelectedIndexes((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= 3) return prev;
      return [...prev, idx];
    });
  }

  async function handleSubmit() {
    if (selectedIndexes.length !== 3) {
      setError('Debes seleccionar exactamente 3 slots alternativos.');
      return;
    }
    setError(null);
    const proposedSlots = selectedIndexes.map((i) => ({
      start: eligibleSlots[i].start.toISOString(),
      end: eligibleSlots[i].end.toISOString(),
    }));

    try {
      setSubmitting(true);
      const res = await fetch(`/api/collaborative/${collabEventId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedSlots }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo enviar la solicitud.');
      }
      onRequested();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} aria-hidden
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Solicitar reagendamiento"
            className="fixed inset-x-4 top-[50%] z-50 w-full max-w-lg translate-y-[-50%] rounded-2xl bg-[var(--surface)] shadow-xl sm:inset-x-auto sm:left-[50%] sm:translate-x-[-50%]"
            initial={{ opacity: 0, scale: 0.95, y: '-48%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, y: '-48%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--fg)]">Solicitar reagendamiento</h2>
                  <p className="text-xs text-[var(--muted)]">Propón 3 horarios alternativos ({selectedIndexes.length}/3)</p>
                </div>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
              {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

              {eligibleSlots.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  No tienes horas libres de {durationMin} min disponibles esta semana.
                </p>
              ) : (
                eligibleSlots.slice(0, 12).map((slot, idx) => {
                  const selected = selectedIndexes.includes(idx);
                  return (
                    <button
                      key={idx} type="button" onClick={() => toggleSlot(idx)}
                      className={['flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition', selected ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white/70 text-[var(--fg)] hover:border-slate-300'].join(' ')}
                    >
                      <span className="capitalize text-xs">{slot.dayLabel}</span>
                      <span className="text-xs">
                        {new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(slot.start)} – {new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(slot.end)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200/60 px-6 py-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-[var(--fg)] transition hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting || selectedIndexes.length !== 3} className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60">
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
