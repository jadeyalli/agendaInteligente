'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Users, ChevronRight, AlertCircle } from 'lucide-react';
import CollaborativeEventDetail from './CollaborativeEventDetail';
import CreateCollaborativeModal from './CreateCollaborativeModal';
import type { AvailableSlot } from '@/components/AvailableSlots';

interface HostedEvent {
  id: string;
  title: string;
  status: string;
  confirmedSlot: string | null;
  durationMin: number;
  description: string | null;
  hostUserId: string;
  _count?: { participants: number };
}

interface InvitedEvent {
  id: string;
  title: string;
  status: string;
  confirmedSlot: string | null;
  durationMin: number;
  description: string | null;
  hostUserId: string;
  myParticipantStatus?: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  VOTING: 'Votacion',
  CONFIRMED: 'Confirmado',
  RENEGOTIATING: 'Renegociando',
  CANCELLED: 'Cancelado',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  VOTING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  RENEGOTIATING: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-rose-100 text-rose-600',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  availableSlots: AvailableSlot[];
  currentUserId: string;
}

/**
 * Panel lateral que muestra los eventos colaborativos del usuario:
 * - "Mis eventos" (anfitrión) y "Invitaciones" (invitado)
 */
export default function CollaborativeSidebar({ isOpen, onClose, availableSlots, currentUserId }: Props) {
  const [hosted, setHosted] = useState<HostedEvent[]>([]);
  const [invited, setInvited] = useState<InvitedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function reload() {
    setLoading(true);
    fetch('/api/collaborative')
      .then((r) => r.ok ? r.json() : { hosted: [], invited: [] })
      .then((data) => {
        setHosted(Array.isArray(data.hosted) ? data.hosted : []);
        setInvited(Array.isArray(data.invited) ? data.invited : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen]);

  const needsAction = hosted.filter(
    (e) => e.status === 'VOTING' || e.status === 'RENEGOTIATING',
  ).length;

  if (selectedId) {
    const allEvents = [...hosted, ...invited];
    const ev = allEvents.find((e) => e.id === selectedId);
    if (!ev) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedId(null)} />
        <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">Evento colaborativo</h2>
            <button onClick={() => setSelectedId(null)} className="rounded-full p-1 hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="max-h-[80vh] overflow-y-auto">
            <CollaborativeEventDetail
              event={ev}
              currentUserId={currentUserId}
              invitation={null}
              votingResults={null}
              availableSlots={availableSlots}
              onAction={() => { reload(); setSelectedId(null); }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="collab-backdrop"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
        {isOpen && (
          <motion.aside
            key="collab-sidebar"
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-[var(--surface)] shadow-xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--fg)]">Colaborativos</h2>
                  {needsAction > 0 && (
                    <p className="text-xs text-amber-600">
                      {needsAction} accion{needsAction > 1 ? 'es' : ''} requerida{needsAction > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Nuevo
                </button>
                <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100">
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Cargando...</p>
              ) : (
                <>
                  {/* Mis eventos */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Mis eventos ({hosted.length})
                    </h3>
                    {hosted.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No tienes eventos como anfitrion.</p>
                    ) : (
                      hosted.map((ev) => {
                        const badge = STATUS_BADGE[ev.status] ?? 'bg-slate-100 text-slate-600';
                        const isActionNeeded = ev.status === 'VOTING' || ev.status === 'RENEGOTIATING';
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedId(ev.id)}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-[var(--fg)]">{ev.title}</span>
                                {isActionNeeded && (
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                                  {STATUS_LABELS[ev.status] ?? ev.status}
                                </span>
                                {ev._count && (
                                  <span className="text-[11px] text-[var(--muted)]">
                                    {ev._count.participants} participante{ev._count.participants !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                          </button>
                        );
                      })
                    )}
                  </section>

                  {/* Invitaciones */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Invitaciones ({invited.length})
                    </h3>
                    {invited.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No tienes invitaciones pendientes.</p>
                    ) : (
                      invited.map((ev) => {
                        const badge = STATUS_BADGE[ev.status] ?? 'bg-slate-100 text-slate-600';
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedId(ev.id)}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="truncate text-sm font-medium text-[var(--fg)]">{ev.title}</span>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                                  {STATUS_LABELS[ev.status] ?? ev.status}
                                </span>
                                {ev.myParticipantStatus && (
                                  <span className="text-[11px] text-[var(--muted)]">
                                    Mi estado: {ev.myParticipantStatus}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                          </button>
                        );
                      })
                    )}
                  </section>
                </>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <CreateCollaborativeModal
        isOpen={showCreate}
        availableSlots={availableSlots}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); reload(); }}
      />
    </>
  );
}
