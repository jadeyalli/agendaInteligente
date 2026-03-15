/**
 * Tipos del dominio de eventos colaborativos.
 * Solo importa enums generados por Prisma — sin cliente ni queries.
 */
import type {
  CollabStatus,
  CollabRole,
  ParticipantStatus,
  RequestStatus,
} from '@prisma/client';

// Re-exportar para que los consumidores no importen de @prisma/client directamente.
export type { CollabStatus, CollabRole, ParticipantStatus, RequestStatus };

// ─── Inputs ────────────────────────────────────────────────────────────────

/** Datos para crear un evento colaborativo. */
export interface CreateCollaborativeEventInput {
  title: string;
  description?: string;
  /** Duración del evento en minutos (múltiplo de 5). */
  durationMin: number;
  /** IANA timezone del anfitrión, ej. "America/Mexico_City". */
  hostTimezone: string;
  /** Exactamente 3 slots propuestos por el anfitrión. */
  proposedSlots: Array<{ start: string; end: string }>;
  /** Invitados con su rol (HOST se asigna automáticamente al creador). */
  participants: Array<{
    userId: string;
    role: Extract<CollabRole, 'ESSENTIAL' | 'REGULAR'>;
  }>;
}

/** Slots alternativos propuestos al solicitar reagendamiento. */
export interface RescheduleRequestInput {
  /** Exactamente 3 slots alternativos con duración igual al evento. */
  proposedSlots: Array<{ start: string; end: string }>;
}

// ─── Proyecciones de lectura ────────────────────────────────────────────────

/**
 * Slot con horario en dos zonas horarias para mostrar en la invitación.
 * Todos los strings son ISO 8601 naive en la zona correspondiente.
 */
export interface TranslatedSlot {
  slotId: string;
  /** Horario de inicio en la zona del anfitrión. */
  startHostTz: string;
  /** Horario de fin en la zona del anfitrión. */
  endHostTz: string;
  /** Horario de inicio en la zona local del invitado. */
  startLocalTz: string;
  /** Horario de fin en la zona local del invitado. */
  endLocalTz: string;
  /** IANA timezone del anfitrión. */
  hostTimezone: string;
  /** IANA timezone local del invitado. */
  localTimezone: string;
}

/** Vista de invitación que recibe cada invitado, con slots traducidos a su zona horaria. */
export interface CollaborativeInvitation {
  collabEventId: string;
  title: string;
  description: string | null;
  durationMin: number;
  /** Nombre o identificador del anfitrión. */
  hostName: string;
  status: CollabStatus;
  myRole: CollabRole;
  myStatus: ParticipantStatus;
  /** Número de la ronda actual de votación (comienza en 1). */
  currentRound: number;
  /** Slots de la ronda actual con traducción de zona horaria. */
  slots: TranslatedSlot[];
}

/** Vista del anfitrión con conteo de votos por slot. */
export interface VotingResults {
  collabEventId: string;
  title: string;
  status: CollabStatus;
  currentRound: number;
  /** Total de invitados no-anfitrión. */
  totalParticipants: number;
  /** Cuántos ya emitieron su voto. */
  totalVotes: number;
  slots: Array<{
    slotId: string;
    /** ISO UTC. */
    start: string;
    /** ISO UTC. */
    end: string;
    votes: number;
    voters: Array<{ userId: string; userName: string | null }>;
  }>;
}

// ─── Resultados de acciones ─────────────────────────────────────────────────

/** Resultado de cualquier acción colaborativa que pueda disparar reagendamiento. */
export interface CollaborativeActionResult {
  success: boolean;
  message: string;
  /** Cambios en la agenda del usuario tras aceptar el evento (si aplica). */
  schedulingChanges?: {
    placed: Array<{ id: string; start: string; end: string }>;
    moved: Array<{ id: string; fromStart: string | null; toStart: string }>;
  };
}
