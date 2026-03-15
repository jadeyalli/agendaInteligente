'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Users, Plus, Trash2 } from 'lucide-react';
import type { AvailableSlot } from '@/components/AvailableSlots';
import type { CreateCollaborativeEventInput } from '@/domain/collaborative-types';

interface Props {
  isOpen: boolean;
  availableSlots: AvailableSlot[];
  onClose: () => void;
  onCreated: (collabEventId: string) => void;
}

interface ParticipantEntry {
  userId: string;
  role: 'ESSENTIAL' | 'REGULAR';
}

const inputBase =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[var(--fg)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60';


/**
 * Modal para que el anfitrión cree un evento colaborativo.
 * Flujo: título → duración → selección de 3 slots libres → invitados.
 */
export default function CreateCollaborativeModal({ isOpen, availableSlots, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [selectedSlotIndexes, setSelectedSlotIndexes] = useState<number[]>([]);
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<'ESSENTIAL' | 'REGULAR'>('REGULAR');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slots cuya duración coincide con la seleccionada
  const eligibleSlots = availableSlots.filter(
    (s) => Math.round((s.end.getTime() - s.start.getTime()) / 60000) === durationMin,
  );

  function toggleSlot(index: number) {
    setSelectedSlotIndexes((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, index];
    });
  }

  function addParticipant() {
    if (!newUserId.trim()) return;
    if (participants.some((p) => p.userId === newUserId.trim())) return;
    setParticipants((prev) => [...prev, { userId: newUserId.trim(), role: newUserRole }]);
    setNewUserId('');
  }

  function removeParticipant(userId: string) {
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  }

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) { setError('El título es obligatorio.'); return; }
    if (selectedSlotIndexes.length !== 3) { setError('Debes seleccionar exactamente 3 slots.'); return; }
    if (participants.length === 0) { setError('Debes agregar al menos un invitado.'); return; }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const proposedSlots = selectedSlotIndexes.map((i) => ({
      start: eligibleSlots[i].start.toISOString(),
      end: eligibleSlots[i].end.toISOString(),
    }));

    const body: CreateCollaborativeEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      durationMin,
      hostTimezone: tz,
      proposedSlots,
      participants,
    };

    try {
      setSubmitting(true);
      const res = await fetch('/api/collaborative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo crear el evento.');
      }
      const { id } = await res.json();
      onCreated(id);
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
            role="dialog" aria-modal="true" aria-label="Crear evento colaborativo"
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
                  <Users className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--fg)]">Evento colaborativo</h2>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-[var(--muted)] transition hover:bg-white hover:text-[var(--fg)]" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* cuerpo */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-4 space-y-4">
              {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Título</label>
                <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del evento" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Descripción (opcional)</label>
                <textarea className={`${inputBase} resize-none`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Información adicional…" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Duración</label>
                <select className={inputBase} value={durationMin} onChange={(e) => { setDurationMin(Number(e.target.value)); setSelectedSlotIndexes([]); }}>
                  {[30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h`}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Selecciona 3 slots ({selectedSlotIndexes.length}/3)
                </label>
                {eligibleSlots.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No hay slots libres de {durationMin} min esta semana.</p>
                ) : (
                  <div className="space-y-1.5">
                    {eligibleSlots.slice(0, 12).map((slot, idx) => {
                      const selected = selectedSlotIndexes.includes(idx);
                      return (
                        <button
                          key={idx} type="button"
                          onClick={() => toggleSlot(idx)}
                          className={['flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition', selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white/70 text-[var(--fg)] hover:border-slate-300'].join(' ')}
                        >
                          <span className="capitalize">{slot.dayLabel}</span>
                          <span>{new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(slot.start)} – {new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(slot.end)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Invitados</label>
                <div className="flex gap-2">
                  <input className={`${inputBase} flex-1`} value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="ID de usuario" onKeyDown={(e) => e.key === 'Enter' && addParticipant()} />
                  <select className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs text-[var(--fg)]" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'ESSENTIAL' | 'REGULAR')}>
                    <option value="REGULAR">Regular</option>
                    <option value="ESSENTIAL">Indispensable</option>
                  </select>
                  <button type="button" onClick={addParticipant} className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {participants.length > 0 && (
                  <div className="space-y-1.5">
                    {participants.map((p) => (
                      <div key={p.userId} className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2">
                        <div>
                          <span className="text-sm font-medium text-[var(--fg)]">{p.userId}</span>
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{p.role === 'ESSENTIAL' ? 'Indispensable' : 'Regular'}</span>
                        </div>
                        <button type="button" onClick={() => removeParticipant(p.userId)} className="text-[var(--muted)] hover:text-red-500 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* acciones */}
            <div className="flex justify-end gap-3 border-t border-slate-200/60 px-6 py-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-[var(--fg)] transition hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={handleSubmit} disabled={submitting} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">
                {submitting ? 'Creando…' : 'Crear evento'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
