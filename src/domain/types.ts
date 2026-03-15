/**
 * Tipos puros del dominio de Agenda Inteligente.
 * No importa nada de Prisma, Next.js, ni ninguna librería externa.
 */

/** Prioridad de evento según el modelo de negocio del sistema. */
export type EventPriority = 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL' | 'RECORDATORIO';

/** Código de prioridad que entiende el solver Python (UnI = Urgente, InU = Relevante). */
export type SolverPriority = 'UnI' | 'InU';

/** Modo de estabilidad del solver: cuánto se penaliza mover eventos existentes. */
export type StabilityMode = 'flexible' | 'balanced' | 'fixed';

/** Tipo de ventana de disponibilidad para eventos flexibles. */
export type AvailabilityWindowType = 'PRONTO' | 'SEMANA' | 'MES' | 'RANGO' | 'NONE';

/** Categoría del usuario con su posición ordinal (rank 1 = máxima prioridad). */
export interface CategoryWithRank {
  name: string;
  rank: number;
}

/** Configuración global que se envía al solver Python. */
export interface SolverPayloadConfig {
  stability: StabilityMode;
  categories: CategoryWithRank[];
  bufferMinutes: number;
  leadMinutes: number;
  /** Hora de inicio del día habilitado, formato "HH:mm". */
  dayStart: string;
  /** Hora de fin del día habilitado, formato "HH:mm". */
  dayEnd: string;
  /** Días activos en índice ISO (0=lun … 6=dom). */
  activeDays: number[];
}

/** Evento fijo en el payload del solver (crítico, pinned o bloque fantasma). */
export interface SolverFixedEvent {
  id: string;
  /** ISO naive en la timezone del usuario. */
  start: string;
  /** ISO naive en la timezone del usuario. */
  end: string;
  /** Si true, el solver no puede agendar otros eventos en este bloque. */
  blocksCapacity: boolean;
}

/** Evento flexible que el solver debe posicionar. */
export interface SolverFlexibleEvent {
  id: string;
  priority: SolverPriority;
  durationMin: number;
  canOverlap: boolean;
  /** ISO naive en la timezone del usuario, o null si es nuevo. */
  currentStart: string | null;
  window: AvailabilityWindowType;
  /** ISO naive — solo para window === 'RANGO'. */
  windowStart: string | null;
  /** ISO naive — solo para window === 'RANGO'. */
  windowEnd: string | null;
  /** Posición ordinal de la categoría del evento (1 = máxima prioridad). */
  categoryRank: number;
}

/** Payload completo enviado al proceso Python del solver. */
export interface SolverPayload {
  user: { id: string; timezone: string };
  horizon: { start: string; end: string; slotMinutes: number };
  availability: {
    preferred: Array<{ start: string; end: string }>;
    fallbackUsed: boolean;
  };
  events: {
    fixed: SolverFixedEvent[];
    movable: SolverFlexibleEvent[];
    new: SolverFlexibleEvent[];
    newFixed: SolverFixedEvent[];
  };
  config: SolverPayloadConfig;
}

/** Evento que el solver posicionó exitosamente. */
export interface SolverPlacedEvent {
  id: string;
  /** ISO naive en la timezone del usuario. */
  start: string;
  /** ISO naive en la timezone del usuario. */
  end: string;
}

/** Evento que el solver desplazó respecto a su posición anterior. */
export interface SolverMovedEvent {
  id: string;
  fromStart: string | null;
  toStart: string;
  reason: string;
}

/** Evento que el solver no pudo colocar en ningún slot válido. */
export interface SolverUnplacedEvent {
  id: string;
  reason: string;
}

/** Respuesta completa del solver Python. */
export interface SolverOutput {
  placed: SolverPlacedEvent[];
  moved: SolverMovedEvent[];
  unplaced: SolverUnplacedEvent[];
  score: number | null;
  diagnostics: {
    hardConflicts: string[];
    summary: string;
  };
}
