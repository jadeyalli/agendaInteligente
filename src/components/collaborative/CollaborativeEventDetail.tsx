'use client';

import { useState } from 'react';
import { Users, Send, CheckCircle, XCircle, LogOut, AlertCircle } from 'lucide-react';
import type { CollaborativeInvitation, VotingResults } from '@/domain/collaborative-types';
import InvitationCard from './InvitationCard';
import VotingResultsPanel from './VotingResultsPanel';
import RescheduleRequestModal from './RescheduleRequestModal';
import type { AvailableSlot } from '@/components/AvailableSlots';

interface CollabEvent {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  status: string;
  confirmedSlot: string | null;
  hostUserId: string;
}

interface Props {
  event: CollabEvent;
  currentUserId: string;
  invitation: CollaborativeInvitation | null;
  votingResults: VotingResults | null;
  availableSlots: AvailableSlot[];
  onAction: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  VOTING: 'Votación abierta',
  CONFIRMED: 'Confirmado',
  RENEGOTIATING: 'Renegociando',
  CANCELLED: 'Cancelado',
};

/**
 * Vista completa de un evento colaborativo.
 * Muestra controles contextuales según el rol del usuario y el estado del evento.
 */
export default function CollaborativeEventDetail({
  event, currentUserId, invitation, votingResults, availableSlots, onAction,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openReschedule, setOpenReschedule] = useState(false);

  const isHost = event.hostUserId === currentUserId;
  const myRole = invitation?.myRole ?? null;
  const myStatus = invitation?.myStatus ?? null;

  async function callAction(path: string, body?: Record<string, unknown>) {
    setError(null);
    try {
      setLoading(true);
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Acción fallida.');
      }
      onAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* encabezado */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 shrink-0">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-[var(--fg)]">{event.title}</h2>
            <span className={['rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', event.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : event.status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700'].join(' ')}>
              {STATUS_LABELS[event.status] ?? event.status}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)]">{event.durationMin} min</p>
          {event.description && <p className="mt-1 text-sm text-[var(--muted)]">{event.description}</p>}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* slot confirmado */}
      {event.status === 'CONFIRMED' && event.confirmedSlot && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">Horario confirmado</p>
          <p className="text-sm font-medium text-emerald-800">
            {new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(event.confirmedSlot))}
          </p>
        </div>
      )}

      {/* acciones del anfitrión */}
      {isHost && (
        <div className="space-y-3">
          {event.status === 'DRAFT' && (
            <button type="button" disabled={loading} onClick={() => callAction(`/api/collaborative/${event.id}/send`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
              <Send className="h-4 w-4" />
              {loading ? 'Enviando…' : 'Enviar invitaciones'}
            </button>
          )}

          {(event.status === 'VOTING' || event.status === 'RENEGOTIATING') && votingResults && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Resultados de votación</p>
              <VotingResultsPanel results={votingResults} onConfirmed={onAction} />
            </div>
          )}

          {event.status !== 'CANCELLED' && (
            <button type="button" disabled={loading} onClick={() => callAction(`/api/collaborative/${event.id}/cancel`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-60">
              <XCircle className="h-4 w-4" />
              Cancelar evento
            </button>
          )}
        </div>
      )}

      {/* acciones del invitado */}
      {!isHost && invitation && (
        <div className="space-y-3">
          {(event.status === 'VOTING' || event.status === 'RENEGOTIATING') && myStatus !== 'VOTED' && (
            <InvitationCard invitation={invitation} onVoted={onAction} />
          )}

          {event.status === 'CONFIRMED' && myStatus === 'VOTED' && (
            <div className="flex gap-3">
              <button type="button" disabled={loading} onClick={() => callAction(`/api/collaborative/${event.id}/accept`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                <CheckCircle className="h-4 w-4" />
                {loading ? '…' : 'Aceptar'}
              </button>
              <button type="button" disabled={loading} onClick={() => callAction(`/api/collaborative/${event.id}/decline`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-[var(--fg)] transition hover:bg-slate-50 disabled:opacity-60">
                <XCircle className="h-4 w-4 text-red-500" />
                Rechazar
              </button>
            </div>
          )}

          {event.status === 'CONFIRMED' && myRole === 'ESSENTIAL' && myStatus === 'ACCEPTED' && (
            <button type="button" onClick={() => setOpenReschedule(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">
              <AlertCircle className="h-4 w-4" />
              Solicitar cambio de horario
            </button>
          )}

          {event.status !== 'CANCELLED' && (
            <button type="button" disabled={loading} onClick={() => callAction(`/api/collaborative/${event.id}/leave`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-[var(--muted)] transition hover:text-red-500 disabled:opacity-60">
              <LogOut className="h-4 w-4" />
              Salir del evento
            </button>
          )}
        </div>
      )}

      <RescheduleRequestModal
        isOpen={openReschedule}
        collabEventId={event.id}
        durationMin={event.durationMin}
        availableSlots={availableSlots}
        onClose={() => setOpenReschedule(false)}
        onRequested={onAction}
      />
    </div>
  );
}
