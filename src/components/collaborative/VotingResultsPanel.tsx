'use client';

import { useState } from 'react';
import { CheckCircle, Users } from 'lucide-react';
import type { VotingResults } from '@/domain/collaborative-types';

interface Props {
  results: VotingResults;
  onConfirmed: () => void;
}

/** Formatea ISO a fecha-hora legible. */
function fmtSlotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/**
 * Panel para el anfitrión que muestra el resultado de la votación por slot
 * y permite confirmar el horario ganador o cualquier otro.
 */
export default function VotingResultsPanel({ results, onConfirmed }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxVotes = Math.max(...results.slots.map((s) => s.votes), 0);

  async function handleConfirm(slotId: string) {
    setError(null);
    try {
      setConfirming(slotId);
      const res = await fetch(`/api/collaborative/${results.collabEventId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo confirmar.');
      }
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* resumen */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Users className="h-4 w-4" />
          <span>{results.totalVotes} de {results.totalParticipants} participantes votaron</span>
        </div>
        <span className="text-xs text-[var(--muted)]">Ronda {results.currentRound}</span>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* slots con conteo de votos */}
      <div className="space-y-3">
        {results.slots.map((slot) => {
          const isWinner = slot.votes === maxVotes && slot.votes > 0;
          return (
            <div
              key={slot.slotId}
              className={['rounded-xl border p-3.5 space-y-2', isWinner ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200/70 bg-white/70'].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--fg)]">
                    {fmtSlotTime(slot.start)} – {fmtSlotTime(slot.end)}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {slot.votes} voto{slot.votes !== 1 ? 's' : ''}
                    {isWinner && slot.votes > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-indigo-600">
                        <CheckCircle className="h-3 w-3" /> Mayor votado
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleConfirm(slot.slotId)}
                  disabled={confirming !== null}
                  className="shrink-0 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {confirming === slot.slotId ? 'Confirmando…' : 'Confirmar'}
                </button>
              </div>

              {/* lista de quién votó */}
              {slot.voters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {slot.voters.map((v) => (
                    <span key={v.userId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {v.userName ?? v.userId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
