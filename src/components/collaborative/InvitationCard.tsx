'use client';

import { useState } from 'react';
import { Users, MapPin } from 'lucide-react';
import type { CollaborativeInvitation, TranslatedSlot } from '@/domain/collaborative-types';

interface Props {
  invitation: CollaborativeInvitation;
  onVoted: () => void;
}

/** Formatea un ISO string a texto legible con fecha y hora. */
function fmtSlotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
 * Tarjeta de invitación a un evento colaborativo.
 * Muestra los 3 slots en formato dual (zona anfitrión + zona local del invitado)
 * y permite votar por exactamente uno.
 */
export default function InvitationCard({ invitation, onVoted }: Props) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [voted, setVoted] = useState(invitation.myStatus === 'VOTED' || invitation.myStatus === 'ACCEPTED');
  const [error, setError] = useState<string | null>(null);

  const canVote = invitation.status === 'VOTING' || invitation.status === 'RENEGOTIATING';

  async function handleVote() {
    if (!selectedSlot) return;
    setError(null);
    try {
      setSubmitting(true);
      const res = await fetch(`/api/collaborative/${invitation.collabEventId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: selectedSlot }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo registrar el voto.');
      }
      setVoted(true);
      onVoted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm space-y-4">
      {/* encabezado */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 shrink-0">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--fg)]">{invitation.title}</h3>
          <p className="text-xs text-[var(--muted)]">
            Invitado por {invitation.hostName} · {invitation.durationMin} min · Ronda {invitation.currentRound}
          </p>
          {invitation.description && (
            <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">{invitation.description}</p>
          )}
        </div>
      </div>

      {/* estado */}
      {voted && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Ya emitiste tu voto para esta ronda.
        </div>
      )}

      {!voted && canVote && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Selecciona un horario
          </p>
          <div className="space-y-2">
            {invitation.slots.map((slot: TranslatedSlot) => (
              <label
                key={slot.slotId}
                className={['flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition', selectedSlot === slot.slotId ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white/60 hover:border-slate-300'].join(' ')}
              >
                <input
                  type="radio"
                  name="slot"
                  value={slot.slotId}
                  checked={selectedSlot === slot.slotId}
                  onChange={() => setSelectedSlot(slot.slotId)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--fg)]">
                    <span>{fmtSlotTime(slot.startHostTz)}</span>
                    <span className="text-[var(--muted)]">–</span>
                    <span>{fmtSlotTime(slot.endHostTz)}</span>
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{slot.hostTimezone}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
                    <MapPin className="h-3 w-3" />
                    <span>En tu zona: {fmtSlotTime(slot.startLocalTz)} – {fmtSlotTime(slot.endLocalTz)}</span>
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px]">{slot.localTimezone}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleVote}
            disabled={!selectedSlot || submitting}
            className="w-full rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Enviar voto'}
          </button>
        </>
      )}

      {!canVote && !voted && (
        <p className="text-sm text-[var(--muted)]">La votación no está abierta en este momento.</p>
      )}
    </div>
  );
}
