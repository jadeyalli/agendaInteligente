import { prisma } from '@/lib/prisma';
import {
  DAY_CODE_TO_WEEKDAY_INDEX,
  mergeUserSettings,
  parseEnabledDaysField,
  timeStringToParts,
} from '@/lib/user-settings';
import type { Event, Priority, Prisma } from '@prisma/client';

const DEFAULT_DURATION_MINUTES = 60;

export type SchedulingPreferences = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  bufferMinutes: number;
  leadMinutes: number;
  enabledWeekdays: Set<number>;
};

export type SchedulingContext = SchedulingPreferences & { earliestStart: Date };

type BusyInterval = { start: Date; end: Date };
type WeightedBusyInterval = BusyInterval & { weight: number };

export async function loadSchedulingPreferences(userId: string): Promise<SchedulingPreferences> {
  const record = await prisma.userSettings.findUnique({ where: { userId } });
  const settings = record
    ? mergeUserSettings({
        dayStart: record.dayStart,
        dayEnd: record.dayEnd,
        enabledDays: parseEnabledDaysField(record.enabledDays),
        eventBufferMinutes: record.eventBufferMinutes,
        schedulingLeadMinutes: record.schedulingLeadMinutes,
      })
    : mergeUserSettings();

  const { hour: startHour, minute: startMinute } = timeStringToParts(settings.dayStart);
  const { hour: endHour, minute: endMinute } = timeStringToParts(settings.dayEnd);

  const enabledWeekdays = new Set<number>(
    settings.enabledDays
      .map((code) => DAY_CODE_TO_WEEKDAY_INDEX[code])
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
  );

  if (enabledWeekdays.size === 0) {
    for (let i = 0; i < 7; i += 1) {
      enabledWeekdays.add(i);
    }
  }

  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
    bufferMinutes: settings.eventBufferMinutes,
    leadMinutes: settings.schedulingLeadMinutes,
    enabledWeekdays,
  };
}

export function buildSchedulingContext(prefs: SchedulingPreferences): SchedulingContext {
  const earliestStart = new Date(Date.now() + prefs.leadMinutes * 60_000);
  return { ...prefs, earliestStart };
}

function isoDayFromJsDay(day: number): number {
  return (day + 6) % 7;
}

function isEnabledDay(date: Date, context: SchedulingContext): boolean {
  const isoIndex = isoDayFromJsDay(date.getDay());
  return context.enabledWeekdays.has(isoIndex);
}

function startOfWorkingDay(date: Date, context: SchedulingContext): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    context.startHour,
    context.startMinute,
    0,
    0,
  );
}

function endOfWorkingDay(date: Date, context: SchedulingContext): Date {
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    context.endHour,
    context.endMinute,
    0,
    0,
  );
  const start = startOfWorkingDay(date, context);
  if (end.getTime() <= start.getTime()) {
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    return next;
  }
  return end;
}

function ensureEarliest(date: Date, context: SchedulingContext): Date {
  const time = Math.max(date.getTime(), context.earliestStart.getTime());
  return new Date(time);
}

function moveToNextWorkingDay(date: Date, context: SchedulingContext): Date {
  const next = new Date(date);
  next.setHours(context.startHour, context.startMinute, 0, 0);
  do {
    next.setDate(next.getDate() + 1);
  } while (!isEnabledDay(next, context));
  return ensureEarliest(next, context);
}

function clampToWorkingHours(date: Date, context: SchedulingContext): Date {
  let candidate = ensureEarliest(date, context);

  while (true) {
    if (!isEnabledDay(candidate, context)) {
      candidate = moveToNextWorkingDay(candidate, context);
      continue;
    }

    const dayStart = startOfWorkingDay(candidate, context);
    const dayEnd = endOfWorkingDay(candidate, context);

    if (candidate.getTime() < dayStart.getTime()) {
      candidate = ensureEarliest(dayStart, context);
      continue;
    }

    if (candidate.getTime() >= dayEnd.getTime()) {
      candidate = moveToNextWorkingDay(candidate, context);
      continue;
    }

    return candidate;
  }
}

export function ensurePositiveDurationMs(event: Event): number {
  if (event.start && event.end) {
    const diff = event.end.getTime() - event.start.getTime();
    if (diff > 0) return diff;
  }
  const minutes = event.durationMinutes && event.durationMinutes > 0 ? event.durationMinutes : DEFAULT_DURATION_MINUTES;
  return minutes * 60 * 1000;
}

export function isUnsetDate(value: Date | null | undefined): boolean {
  return !value || value.getTime() === 0;
}

export function schedulingWindowOf(
  event: Event,
  context: SchedulingContext,
): { start: Date; end: Date | null } | null {
  const now = new Date();
  const candidates: Date[] = [];
  if (event.start) candidates.push(event.start);
  if (event.windowStart) candidates.push(event.windowStart);
  candidates.push(now);
  let start = candidates.reduce((max, current) => (current.getTime() > max.getTime() ? current : max));

  let end: Date | null = event.windowEnd ?? null;

  switch (event.window) {
    case 'PRONTO': {
      const prontoEnd = new Date(start.getTime() + 48 * 60 * 60 * 1000);
      end = end ? new Date(Math.min(end.getTime(), prontoEnd.getTime())) : prontoEnd;
      break;
    }
    case 'SEMANA': {
      const weekEnd = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      end = end ? new Date(Math.min(end.getTime(), weekEnd.getTime())) : weekEnd;
      break;
    }
    case 'MES': {
      const monthEnd = addMonthsSafe(start, 1);
      end = end ? new Date(Math.min(end.getTime(), monthEnd.getTime())) : monthEnd;
      break;
    }
    case 'RANGO': {
      if (event.windowStart && event.windowStart.getTime() > start.getTime()) {
        start = event.windowStart;
      }
      if (event.windowEnd && (!end || event.windowEnd.getTime() < end.getTime())) {
        end = event.windowEnd;
      }
      break;
    }
    default: {
      if (event.windowStart && event.windowStart.getTime() > start.getTime()) {
        start = event.windowStart;
      }
      if (event.windowEnd && (!end || event.windowEnd.getTime() < end.getTime())) {
        end = event.windowEnd;
      }
      break;
    }
  }

  const clampedStart = clampToWorkingHours(start, context);

  if (end) {
    const normalizedEnd = new Date(Math.max(end.getTime(), context.earliestStart.getTime()));
    if (normalizedEnd.getTime() <= clampedStart.getTime()) {
      return null;
    }
    return { start: clampedStart, end: normalizedEnd };
  }

  return { start: clampedStart, end: null };
}

function findNextSlot(
  durationMs: number,
  start: Date,
  end: Date | null,
  busy: BusyInterval[],
  context: SchedulingContext,
): Date | null {
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const bufferMs = context.bufferMinutes > 0 ? context.bufferMinutes * 60_000 : 0;
  const limit = end ? Math.max(end.getTime(), context.earliestStart.getTime()) : Number.POSITIVE_INFINITY;

  if (limit <= context.earliestStart.getTime()) {
    return null;
  }

  let cursor = clampToWorkingHours(start, context);

  if (cursor.getTime() >= limit) {
    return null;
  }

  while (cursor.getTime() + durationMs <= limit) {
    const dayEnd = endOfWorkingDay(cursor, context);

    if (cursor.getTime() + durationMs > dayEnd.getTime()) {
      cursor = moveToNextWorkingDay(cursor, context);
      if (cursor.getTime() >= limit) {
        return null;
      }
      continue;
    }

    if (bufferMs && cursor.getTime() + durationMs + bufferMs > dayEnd.getTime()) {
      cursor = moveToNextWorkingDay(cursor, context);
      if (cursor.getTime() >= limit) {
        return null;
      }
      continue;
    }

    let conflict: BusyInterval | null = null;
    const candidateStart = cursor.getTime();
    const candidateEnd = candidateStart + durationMs;

    for (const interval of sorted) {
      const busyStart = interval.start.getTime();
      const busyEnd = interval.end.getTime();

      if (candidateEnd <= busyStart - bufferMs) {
        break;
      }

      if (candidateStart >= busyEnd + bufferMs) {
        continue;
      }

      conflict = interval;
      break;
    }

    if (!conflict) {
      return cursor;
    }

    const nextStart = new Date(Math.max(conflict.end.getTime() + bufferMs, candidateStart + 60_000));
    cursor = clampToWorkingHours(nextStart, context);
  }

  return null;
}

function upsertInterval(list: BusyInterval[], interval: BusyInterval): BusyInterval[] {
  const next = [...list, interval];
  next.sort((a, b) => a.start.getTime() - b.start.getTime());
  return next;
}

function upsertWeightedInterval(
  list: WeightedBusyInterval[],
  interval: WeightedBusyInterval,
): WeightedBusyInterval[] {
  const next = [...list, interval];
  next.sort((a, b) => a.start.getTime() - b.start.getTime());
  return next;
}

const PRIORITY_RANK: Record<string, number> = {
  CRITICA: 4,
  URGENTE: 3,
  RELEVANTE: 2,
  OPCIONAL: 1,
  RECORDATORIO: 0,
};

function priorityWeight(priority: Priority): number {
  return PRIORITY_RANK[priority as unknown as string] ?? 0;
}

function lowerPriorityTargets(priority: Priority): Priority[] {
  const base = priorityWeight(priority);
  return ['CRITICA', 'URGENTE', 'RELEVANTE']
    .filter((candidate) => priorityWeight(candidate as Priority) > 0 && priorityWeight(candidate as Priority) < base)
    .map((candidate) => candidate as Priority);
}

export async function preemptLowerPriorityEvents(
  userId: string,
  newEvents: Event[],
  context: SchedulingContext,
) {
  for (const current of newEvents) {
    if (current.kind !== 'EVENTO' || !current.start || !current.end) continue;

    const prioritiesToMove = lowerPriorityTargets(current.priority);
    if (!prioritiesToMove.length) continue;

    const overlapping = await prisma.event.findMany({
      where: {
        userId,
        id: { not: current.id },
        kind: 'EVENTO',
        participatesInScheduling: true,
        isFixed: false,
        priority: { in: prioritiesToMove },
        start: { lt: current.end },
        end: { gt: current.start },
      },
    });

    if (!overlapping.length) continue;

    const toMoveIds = new Set(overlapping.map((event) => event.id));

    const blockingEvents = await prisma.event.findMany({
      where: {
        userId,
        kind: 'EVENTO',
        participatesInScheduling: true,
        start: { not: null },
        end: { not: null },
      },
    });

    let busy: BusyInterval[] = blockingEvents
      .filter((event) => !toMoveIds.has(event.id) && event.start && event.end)
      .map((event) => ({ start: event.start!, end: event.end! }));

    const sortedOverlaps = [...overlapping].sort((a, b) => {
      const diff = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (diff !== 0) return diff;
      if (a.start && b.start) return a.start.getTime() - b.start.getTime();
      if (a.start) return -1;
      if (b.start) return 1;
      return 0;
    });

    const updates: { id: string; data: Prisma.EventUpdateInput }[] = [];

    for (const event of sortedOverlaps) {
      const window = schedulingWindowOf(event, context);
      if (!window) {
        updates.push({
          id: event.id,
          data: {
            start: null,
            end: null,
            status: 'WAITLIST',
            participatesInScheduling: false,
          },
        });
        continue;
      }

      const durationMs = ensurePositiveDurationMs(event);
      const nextSlot = findNextSlot(durationMs, window.start, window.end, busy, context);

      if (!nextSlot) {
        updates.push({
          id: event.id,
          data: {
            start: null,
            end: null,
            status: 'WAITLIST',
            participatesInScheduling: false,
          },
        });
        continue;
      }

      const nextEnd = new Date(nextSlot.getTime() + durationMs);
      updates.push({
        id: event.id,
        data: {
          start: nextSlot,
          end: nextEnd,
          status: 'SCHEDULED',
          participatesInScheduling: true,
        },
      });
      busy = upsertInterval(busy, { start: nextSlot, end: nextEnd });
    }

    if (updates.length) {
      await prisma.$transaction(
        updates.map((update) => prisma.event.update({ where: { id: update.id }, data: update.data })),
      );
    }
  }
}

export async function scheduleFlexibleEvents(
  userId: string,
  candidates: Event[],
  context: SchedulingContext,
) {
  const toSchedule = candidates.filter(
    (event) =>
      event.kind === 'EVENTO' &&
      event.participatesInScheduling &&
      !event.isFixed &&
      (event.priority === 'URGENTE' || event.priority === 'RELEVANTE') &&
      isUnsetDate(event.start),
  );

  if (!toSchedule.length) return;

  const candidateIds = new Set(toSchedule.map((event) => event.id));

  const blockingEvents = await prisma.event.findMany({
    where: {
      userId,
      kind: 'EVENTO',
      participatesInScheduling: true,
      start: { not: null },
      end: { not: null },
      NOT: { id: { in: Array.from(candidateIds) } },
    },
  });

  let busy: WeightedBusyInterval[] = blockingEvents
    .filter((event) => event.start && event.end)
    .map((event) => ({
      start: event.start!,
      end: event.end!,
      weight: priorityWeight(event.priority),
    }));

  const sorted = [...toSchedule].sort((a, b) => {
    const diff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const updates: { id: string; data: Prisma.EventUpdateInput }[] = [];

  for (const event of sorted) {
    const window = schedulingWindowOf(event, context);
    if (!window) {
      updates.push({
        id: event.id,
        data: {
          start: null,
          end: null,
          status: 'WAITLIST',
          participatesInScheduling: false,
        },
      });
      continue;
    }

    const durationMs = ensurePositiveDurationMs(event);
    const candidateWeight = priorityWeight(event.priority);
    const effectiveBusy = busy
      .filter((interval) => interval.weight >= candidateWeight)
      .map(({ start, end }) => ({ start, end }));
    const nextSlot = findNextSlot(durationMs, window.start, window.end, effectiveBusy, context);

    if (!nextSlot) {
      updates.push({
        id: event.id,
        data: {
          start: null,
          end: null,
          status: 'WAITLIST',
          participatesInScheduling: false,
        },
      });
      continue;
    }

    const nextEnd = new Date(nextSlot.getTime() + durationMs);
    updates.push({
      id: event.id,
      data: {
        start: nextSlot,
        end: nextEnd,
        status: 'SCHEDULED',
        participatesInScheduling: true,
      },
    });
    busy = upsertWeightedInterval(busy, {
      start: nextSlot,
      end: nextEnd,
      weight: candidateWeight,
    });
  }

  if (updates.length) {
    await prisma.$transaction(
      updates.map((update) => prisma.event.update({ where: { id: update.id }, data: update.data })),
    );
  }
}

function addMonthsSafe(d: Date, delta: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const h = d.getHours();
  const mi = d.getMinutes();
  const s = d.getSeconds();
  const ms = d.getMilliseconds();
  const lastOfTarget = new Date(y, m + delta + 1, 0).getDate();
  const newDay = Math.min(day, lastOfTarget);
  return new Date(y, m + delta, newDay, h, mi, s, ms);
}

