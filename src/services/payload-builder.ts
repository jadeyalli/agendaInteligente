/**
 * Servicio que construye el payload para el solver Python a partir de la BD.
 * Responsabilidad única: Prisma → SolverPayload tipado.
 */
import { dateToDateStringLocal, dateToTimeStringLocal } from '@/lib/timezone';
import {
  DEFAULT_USER_SETTINGS,
  JS_DAY_TO_DAY_CODE,
  dayCodesToWeekdayIndexes,
  mergeUserSettings,
  parseEnabledDaysField,
  timeStringToParts,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';
import { collaborativeRepository } from '@/repositories/collaborative.repo';
import { eventRepository } from '@/repositories/events.repo';
import { reservationsRepository } from '@/repositories/reservations.repo';
import { settingsRepository } from '@/repositories/settings.repo';
import { expandReservations } from '@/services/reservations';

import { Priority } from '@prisma/client';

import type {
  SolverFixedEvent,
  SolverFlexibleEvent,
  SolverPayload,
} from '@/domain/types';

// ————————————————————————————————————————————
// Helpers de tiempo
// ————————————————————————————————————————————

/**
 * Convierte un Date UTC a un ISO naive en la timezone del usuario.
 * El solver interpreta todos los timestamps en la timezone del usuario.
 */
function toLocalISO(dt: Date, tz: string): string {
  const datePart = dateToDateStringLocal(dt, tz);
  const timePart = dateToTimeStringLocal(dt, tz);
  return `${datePart}T${timePart}:00`;
}

/** Devuelve el último instante del mes en curso. */
function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Calcula minutos entre dos fechas; retorna mínimo 1. */
function minutesBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
}

/** Fuerza una fecha dentro de [min, max]. */
function clampDate(date: Date, min: Date, max: Date): Date {
  return new Date(Math.min(Math.max(date.getTime(), min.getTime()), max.getTime()));
}

// ————————————————————————————————————————————
// Mapeo de prioridades
// ————————————————————————————————————————————

/**
 * Mapea la prioridad de la BD al código que entiende el solver.
 * UI = Crítica (evento fijo), UnI = Urgente, InU = Relevante, NN = resto.
 */
function mapPriorityToSolverCode(p: Priority): 'UI' | 'UnI' | 'InU' | 'NN' {
  switch (p) {
    case 'CRITICA':      return 'UI';
    case 'URGENTE':      return 'UnI';
    case 'RELEVANTE':    return 'InU';
    default:             return 'NN';
  }
}

/**
 * Ventana de disponibilidad por defecto según la prioridad del evento.
 * URGENTE → PRONTO (48 h), RELEVANTE → MES (30 d).
 */
function defaultWindowFor(p: Priority): 'PRONTO' | 'SEMANA' | 'MES' {
  if (p === 'URGENTE')   return 'PRONTO';
  if (p === 'RELEVANTE') return 'MES';
  return 'SEMANA';
}

// ————————————————————————————————————————————
// Generación de rangos preferidos
// ————————————————————————————————————————————

/**
 * Genera los bloques horarios preferidos dentro del horizonte de planificación.
 * Itera día a día y construye un rango por cada día habilitado usando el horario global.
 */
function generatePreferredRanges(
  horizonStart: Date,
  horizonEnd: Date,
  settings: UserSettingsValues,
  tz: string,
): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const enabled = new Set<DayCode>(settings.enabledDays);
  const { hour: startHour, minute: startMinute } = timeStringToParts(settings.dayStart);
  const { hour: endHour, minute: endMinute } = timeStringToParts(settings.dayEnd);

  const cursor = new Date(horizonStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizonEnd) {
    const jsDay = cursor.getDay();
    const dayCode = JS_DAY_TO_DAY_CODE[jsDay];

    if (dayCode && enabled.has(dayCode)) {
      const dayStart = new Date(cursor);
      dayStart.setHours(startHour, startMinute, 0, 0);
      let dayEnd = new Date(cursor);
      dayEnd.setHours(endHour, endMinute, 0, 0);

      if (dayEnd <= dayStart) {
        dayStart.setHours(0, 0, 0, 0);
        dayEnd = new Date(cursor);
        dayEnd.setDate(dayEnd.getDate() + 1);
      }

      const start = clampDate(dayStart, horizonStart, horizonEnd);
      const end = clampDate(dayEnd, horizonStart, horizonEnd);

      if (end.getTime() > start.getTime()) {
        ranges.push({ start: toLocalISO(start, tz), end: toLocalISO(end, tz) });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}

// ————————————————————————————————————————————
// Parseo de categorías desde settings
// ————————————————————————————————————————————

/**
 * Parsea el campo JSON de categorías del usuario y retorna un mapa name→rank.
 * Las categorías se ordenan según su posición en el array (rank 1 = primera).
 * Si el campo no es válido, retorna un mapa vacío.
 */
function parseCategoryRankMap(categoriesJson: string): Map<string, number> {
  try {
    const parsed: unknown = JSON.parse(categoriesJson);
    if (!Array.isArray(parsed)) return new Map();
    const names = parsed.filter((x): x is string => typeof x === 'string');
    return new Map(names.map((name, i) => [name, i + 1]));
  } catch {
    return new Map();
  }
}

// ————————————————————————————————————————————
// Función pública
// ————————————————————————————————————————————

/**
 * Construye el payload completo para el solver Python cargando los datos
 * del usuario desde la base de datos.
 *
 * @param userId - ID del usuario para quien se construye el payload.
 * @param extraNewEvents - Eventos nuevos adicionales que no están en la BD aún.
 * @returns SolverPayload listo para ser serializado y enviado al proceso Python.
 */
export async function buildSolverPayload(
  userId: string,
  extraNewEvents: SolverFlexibleEvent[] = [],
): Promise<SolverPayload> {
  const now = new Date();
  const horizonStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const horizonEnd = endOfMonth(now);

  const [rawSettings, events, phantomBlocks, reservations] = await Promise.all([
    settingsRepository.findByUserId(userId),
    eventRepository.findByUserId(userId),
    collaborativeRepository.findActivePhantomBlocks(userId),
    reservationsRepository.findByUserId(userId),
  ]);

  const tz = rawSettings?.timezone ?? DEFAULT_USER_SETTINGS.timezone;

  const settings = mergeUserSettings(
    rawSettings
      ? {
          dayStart: rawSettings.dayStart,
          dayEnd: rawSettings.dayEnd,
          enabledDays: parseEnabledDaysField(rawSettings.enabledDays),
          eventBufferMinutes: rawSettings.eventBufferMinutes,
          schedulingLeadMinutes: rawSettings.schedulingLeadMinutes,
          timezone: rawSettings.timezone,
        }
      : null,
  );

  // Categorías del usuario desde settings (rank por posición en el array)
  const categoryRankMap = parseCategoryRankMap(rawSettings?.categories ?? '[]');
  const categoriesConfig = Array.from(categoryRankMap.entries()).map(([name, rank]) => ({
    name,
    rank,
  }));

  const fixed: SolverFixedEvent[] = [];
  const movable: SolverFlexibleEvent[] = [];

  for (const r of events) {
    // Excluir eventos completados y los que no participan en el agendamiento
    if (r.completed || !r.participatesInScheduling) continue;

    // Eventos pasados (end < now) que no están completados → tratarlos como fijos
    // para que el solver no los mueva ni los use como espacio disponible
    if (r.end && new Date(r.end) < now && r.start) {
      fixed.push({
        id: r.id,
        start: toLocalISO(new Date(r.start), tz),
        end: toLocalISO(new Date(r.end), tz),
        blocksCapacity: !r.canOverlap,
      });
      continue;
    }

    const prio = mapPriorityToSolverCode(r.priority);
    const blocksCapacity = !r.canOverlap;
    const durationMin =
      r.durationMinutes ?? minutesBetween(r.start ?? null, r.end ?? null) ?? 30;
    const categoryRank = r.category ? (categoryRankMap.get(r.category) ?? 1) : 1;

    // Críticos con hora asignada → evento fijo (inmutable para el solver)
    if (prio === 'UI' && r.start && r.end) {
      fixed.push({
        id: r.id,
        start: toLocalISO(new Date(r.start), tz),
        end: toLocalISO(new Date(r.end), tz),
        blocksCapacity,
      });
      continue;
    }

    // Eventos fijados por el usuario (isFixed) → también van como fijos
    // Bug fix crítico: isFixed=true debe ir a fixed, no a movable.
    if (r.isFixed && r.start && r.end) {
      fixed.push({
        id: r.id,
        start: toLocalISO(new Date(r.start), tz),
        end: toLocalISO(new Date(r.end), tz),
        blocksCapacity,
      });
      continue;
    }

    // Urgentes y Relevantes → eventos flexibles que el solver optimiza
    if (prio === 'UnI' || prio === 'InU') {
      const currentStart = r.start ? toLocalISO(new Date(r.start), tz) : null;
      const window = (r.window ?? defaultWindowFor(r.priority)) as
        | 'PRONTO'
        | 'SEMANA'
        | 'MES'
        | 'RANGO';

      movable.push({
        id: r.id,
        priority: prio,
        durationMin,
        canOverlap: r.canOverlap,
        currentStart,
        window,
        windowStart: r.windowStart ? toLocalISO(new Date(r.windowStart), tz) : null,
        windowEnd: r.windowEnd ? toLocalISO(new Date(r.windowEnd), tz) : null,
        categoryRank,
      });
    }
  }

  // Bloques fantasma activos → tratados como eventos fijos que bloquean capacidad.
  // El solver no sabe que son fantasma: solo ve un bloque ocupado (restricción R7).
  for (const phantom of phantomBlocks) {
    fixed.push({
      id: `phantom_${phantom.id}`,
      start: toLocalISO(phantom.start, tz),
      end: toLocalISO(phantom.end, tz),
      blocksCapacity: true,
    });
  }

  // Reservaciones (puntuales + recurrentes expandidas) → también bloquean capacidad.
  const reservationInstances = expandReservations(reservations, horizonStart, horizonEnd);
  for (const inst of reservationInstances) {
    fixed.push({
      id: `reservation_${inst.id}`,
      start: toLocalISO(inst.start, tz),
      end: toLocalISO(inst.end, tz),
      blocksCapacity: true,
    });
  }

  const preferredRanges = generatePreferredRanges(
    horizonStart,
    horizonEnd,
    settings,
    tz,
  );

  const activeDays = Array.from(
    new Set(dayCodesToWeekdayIndexes(settings.enabledDays)),
  ).sort((a, b) => a - b);

  return {
    user: { id: userId, timezone: tz },
    horizon: {
      start: toLocalISO(horizonStart, tz),
      end: toLocalISO(horizonEnd, tz),
      slotMinutes: 5,
    },
    availability: {
      preferred: preferredRanges,
      fallbackUsed: preferredRanges.length === 0,
    },
    events: {
      fixed,
      movable,
      new: extraNewEvents,
      newFixed: [],
    },
    config: {
      categories: categoriesConfig,
      bufferMinutes: settings.eventBufferMinutes,
      leadMinutes: settings.schedulingLeadMinutes,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      activeDays,
    },
  };
}
