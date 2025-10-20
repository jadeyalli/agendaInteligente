import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { buildUTCDateFromStrings } from '@/lib/timezone';
import {
  AvailabilityWindow,
  Priority,
  RepeatRule,
  ICalTodoStatus,
  Prisma,
  Event,
} from '@prisma/client';

function normalizeToUTC(date: Date | null | undefined): Date | null {
  if (!date) return null;
  if (!(date instanceof Date)) {
    // Si viene como string ISO, convertir
    const d = new Date(date as any);
    return isNaN(d.getTime()) ? null : d;
  }
  // Ya es Date, devolver como-está (la BD lo guardrá en UTC)
  return isNaN(date.getTime()) ? null : date;
}

const PRIORITY_ALIAS_MAP: Record<string, Priority> = {
  UI: 'CRITICA',
  UNI: 'URGENTE',
  INU: 'RELEVANTE',
  NN: 'OPCIONAL',
  REMINDER: 'OPCIONAL',
  REMINDERS: 'OPCIONAL',
  RECORDATORIO: 'OPCIONAL',
  RECORDATORIOS: 'OPCIONAL',
};

const PRIORITY_ORDER: Priority[] = ['CRITICA', 'URGENTE', 'RELEVANTE', 'OPCIONAL'];
const RESCHEDULABLE_PRIORITIES: Priority[] = ['CRITICA', 'URGENTE', 'RELEVANTE'];

function normalizePriorityInput(value: unknown): Priority | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const upper = trimmed.toUpperCase();
  if ((Object.values(Priority) as string[]).includes(upper)) {
    return upper as Priority;
  }

  if (upper in PRIORITY_ALIAS_MAP) {
    return PRIORITY_ALIAS_MAP[upper];
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

function sanitizeEventPayload(
  raw: unknown,
  options: { treatMissingPriorityAsOptionalHint?: boolean } = {}
): unknown {
  if (!isPlainObject(raw)) return raw;

  const clone: Record<string, unknown> = { ...raw };

  const assignFromDateFragments = (
    target: 'start' | 'end' | 'windowStart' | 'windowEnd' | 'dueDate',
    fallbackTime?: string
  ) => {
    const dateKey = `${target}Date`;
    const timeKey = `${target}Time`;

    if (!clone.hasOwnProperty(dateKey) && !clone.hasOwnProperty(timeKey)) {
      return;
    }

    const dateValue = clone[dateKey] as string | Date | null | undefined;
    const timeValue = clone[timeKey] as string | number | null | undefined;

    const parsed = buildUTCDateFromStrings(dateValue ?? null, timeValue ?? null, { fallbackTime });
    if (parsed) {
      clone[target] = parsed;
    } else if (dateValue != null) {
      clone[target] = null;
    }

    delete clone[dateKey];
    delete clone[timeKey];
  };

  assignFromDateFragments('start');
  assignFromDateFragments('end');
  assignFromDateFragments('windowStart', '00:00');
  assignFromDateFragments('windowEnd', '23:59');
  assignFromDateFragments('dueDate');

  const booleanKeys = ['isInPerson', 'canOverlap', 'participatesInScheduling', 'isFixed'] as const;
  for (const key of booleanKeys) {
    if (key in clone) {
      const coerced = coerceBoolean(clone[key]);
      if (coerced !== undefined) {
        clone[key] = coerced;
      }
    }
  }

  const participates =
    typeof clone.participatesInScheduling === 'boolean'
      ? (clone.participatesInScheduling as boolean)
      : undefined;

  const statusUpper =
    typeof clone.status === 'string' ? (clone.status as string).trim().toUpperCase() : undefined;

  const optionalHint = participates === false || statusUpper === 'WAITLIST';

  if ('priority' in clone) {
    const value = clone.priority;
    if (
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      typeof value !== 'string'
    ) {
      clone.priority = optionalHint ? 'OPCIONAL' : 'RELEVANTE';
    }
  } else if (options.treatMissingPriorityAsOptionalHint && optionalHint) {
    clone.priority = 'OPCIONAL';
  }

  return clone;
}

const PrioritySchema = z
  .union([z.nativeEnum(Priority), z.string()])
  .transform((value, ctx) => {
    const normalized = normalizePriorityInput(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid priority' });
      return z.NEVER;
    }
    return normalized;
  });

function priorityPolicy(priority: Priority): {
  participatesInScheduling: boolean;
  isFixed: boolean;
  status: 'SCHEDULED' | 'WAITLIST';
} {
  switch (priority) {
    case 'CRITICA':
      return { participatesInScheduling: true, isFixed: true, status: 'SCHEDULED' };
    case 'URGENTE':
    case 'RELEVANTE':
      return { participatesInScheduling: true, isFixed: false, status: 'SCHEDULED' };
    case 'OPCIONAL':
    default:
      return { participatesInScheduling: false, isFixed: false, status: 'WAITLIST' };
  }
}


/** DELETE /api/events?id=... [&cascade=series] */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const cascade = searchParams.get('cascade'); // 'series' para borrar master + hijas

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const target = await prisma.event.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (cascade === 'series') {
      // si es master, borra master + hijas; si es hija, borra su master y la serie
      const masterId = target.originEventId ?? target.id;
      await prisma.event.deleteMany({
        where: { OR: [{ id: masterId }, { originEventId: masterId }] },
      });
      return NextResponse.json({ ok: true, deleted: 'series' });
    }

    // borrar solo el evento seleccionado
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PATCH /api/events?id=...  (actualización parcial básica) */
const PatchSchema = z.object({
  // comunes
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  category: z.string().nullable().optional(),
  priority: PrioritySchema.optional(),

  // evento
  start: z.union([z.coerce.date(), z.null()]).optional(),
  end: z.union([z.coerce.date(), z.null()]).optional(),
  isAllDay: z.boolean().optional(),

  // tarea
  dueDate: z.union([z.coerce.date(), z.null()]).optional(),
  todoStatus: z.nativeEnum(ICalTodoStatus).optional(),

  // comportamiento
  isInPerson: z.boolean().optional(),
  canOverlap: z.boolean().optional(),
  participatesInScheduling: z.boolean().optional(),
  status: z.string().optional(),

  // ventana
  window: z.nativeEnum(AvailabilityWindow).optional(),
  windowStart: z.union([z.coerce.date(), z.null()]).optional(),
  windowEnd: z.union([z.coerce.date(), z.null()]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const raw = await req.json().catch(() => ({}));
    const sanitized = sanitizeEventPayload(raw);
    const parsed = PatchSchema.safeParse(sanitized);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data as any;

    // Normalizar fechas
    if (data.hasOwnProperty('start')) {
      data.start = normalizeToUTC(data.start);
    }
    if (data.hasOwnProperty('end')) {
      data.end = normalizeToUTC(data.end);
    }
    if (data.hasOwnProperty('dueDate')) {
      data.dueDate = normalizeToUTC(data.dueDate);
    }
    if (data.hasOwnProperty('windowStart')) {
      data.windowStart = normalizeToUTC(data.windowStart);
    }
    if (data.hasOwnProperty('windowEnd')) {
      data.windowEnd = normalizeToUTC(data.windowEnd);
    }

    if (data.priority) {
      const policy = priorityPolicy(data.priority);
      data.participatesInScheduling = policy.participatesInScheduling;
      data.isFixed = policy.isFixed;

      if (policy.status === 'WAITLIST') {
        data.status = 'WAITLIST';
        data.start = null;
        data.end = null;
        data.window = 'NONE';
        data.windowStart = null;
        data.windowEnd = null;
      } else {
        data.status = data.status ?? 'SCHEDULED';
        if (policy.isFixed) {
          data.canOverlap = false;
        }
      }
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        title: data.title,
        description: data.hasOwnProperty('description') ? data.description : undefined,
        category: data.hasOwnProperty('category') ? data.category : undefined,
        priority: data.priority,

        start: data.hasOwnProperty('start') ? data.start : undefined,
        end: data.hasOwnProperty('end') ? data.end : undefined,
        isAllDay: data.isAllDay,

        dueDate: data.hasOwnProperty('dueDate') ? data.dueDate : undefined,
        todoStatus: data.todoStatus,

        isInPerson: data.isInPerson,
        canOverlap: data.canOverlap,
        participatesInScheduling: data.participatesInScheduling,
        status: data.status,

        window: data.window,
        windowStart: data.hasOwnProperty('windowStart') ? data.windowStart : undefined,
        windowEnd: data.hasOwnProperty('windowEnd') ? data.windowEnd : undefined,
      },
    });

    const shouldResolve =
      updated.kind === 'EVENTO' &&
      !updated.canOverlap &&
      RESCHEDULABLE_PRIORITIES.includes(updated.priority);

    if (shouldResolve) {
      await resolveSchedulingConflicts(updated.userId);
      const refreshed = await prisma.event.findUnique({ where: { id: updated.id } });
      if (refreshed) {
        return NextResponse.json(refreshed);
      }
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}


/** Usuario demo */
async function ensureDemoUser() {
  const email = 'demo@local';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: 'Demo' } });
  }
  return user;
}

/** Zod comunes */
const zDate = z.union([z.coerce.date(), z.null(), z.undefined()]);

/** ============ helpers de fechas (seguros para fin de mes / años bisiestos) ============ */
function addMonthsSafe(d: Date, delta: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();
  const lastOfTarget = new Date(y, m + delta + 1, 0).getDate();
  const newDay = Math.min(day, lastOfTarget);
  return new Date(y, m + delta, newDay, h, mi, s, ms);
}

function addYearsSafe(d: Date, delta: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds(), ms = d.getMilliseconds();
  const candidate = new Date(y + delta, m, day, h, mi, s, ms);
  if (candidate.getMonth() !== m) {
    const lastDay = new Date(y + delta, m + 1, 0).getDate();
    return new Date(y + delta, m, Math.min(day, lastDay), h, mi, s, ms);
  }
  return candidate;
}

function addPeriodSafe(d: Date, rule: RepeatRule): Date {
  switch (rule) {
    case 'DAILY': {
      const out = new Date(d); out.setDate(out.getDate() + 1); return out;
    }
    case 'WEEKLY': {
      const out = new Date(d); out.setDate(out.getDate() + 7); return out;
    }
    case 'MONTHLY':
      return addMonthsSafe(d, 1);
    case 'YEARLY':
      return addYearsSafe(d, 1);
    default:
      return d;
  }
}

function endOfYearOf(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

type BusyInterval = { start: Date; end: Date };
type WeightedBusyInterval = BusyInterval & { weight: number };

const DEFAULT_DURATION_MINUTES = 60;
const WORK_START_HOUR = 5;
const WORK_END_HOUR = 23;

function mergeBusyIntervals(list: BusyInterval[]): BusyInterval[] {
  if (!list.length) return [];

  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyInterval[] = [];

  for (const current of sorted) {
    const candidate = { start: new Date(current.start), end: new Date(current.end) };

    if (!merged.length) {
      merged.push(candidate);
      continue;
    }

    const last = merged[merged.length - 1];
    if (candidate.start.getTime() <= last.end.getTime()) {
      if (candidate.end.getTime() > last.end.getTime()) {
        last.end = candidate.end;
      }
    } else {
      merged.push(candidate);
    }
  }

  return merged;
}

function mergeWeightedBusyIntervals(list: WeightedBusyInterval[]): WeightedBusyInterval[] {
  if (!list.length) return [];

  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: WeightedBusyInterval[] = [];

  for (const current of sorted) {
    const candidate: WeightedBusyInterval = {
      start: new Date(current.start),
      end: new Date(current.end),
      weight: current.weight,
    };

    if (!merged.length) {
      merged.push(candidate);
      continue;
    }

    const last = merged[merged.length - 1];
    const overlaps = candidate.start.getTime() <= last.end.getTime();

    if (overlaps && candidate.weight === last.weight) {
      if (candidate.end.getTime() > last.end.getTime()) {
        last.end = candidate.end;
      }
      continue;
    }

    merged.push(candidate);
  }

  return merged;
}

function ensurePositiveDurationMs(event: Event): number {
  if (event.start && event.end) {
    const diff = event.end.getTime() - event.start.getTime();
    if (diff > 0) return diff;
  }
  const minutes = event.durationMinutes && event.durationMinutes > 0 ? event.durationMinutes : DEFAULT_DURATION_MINUTES;
  return minutes * 60 * 1000;
}

function isUnsetDate(value: Date | null | undefined): boolean {
  return !value || value.getTime() === 0;
}

function startOfWorkingDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), WORK_START_HOUR, 0, 0, 0);
}

function endOfWorkingDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), WORK_END_HOUR, 0, 0, 0);
}

function earliestSchedulingStart(): Date {
  const now = new Date();
  const todayStart = startOfWorkingDay(now);
  return now.getTime() > todayStart.getTime() ? now : todayStart;
}

function moveToNextWorkingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(WORK_START_HOUR, 0, 0, 0);
  const earliest = earliestSchedulingStart();
  return next.getTime() < earliest.getTime() ? earliest : next;
}

function clampToWorkingHours(date: Date): Date {
  const earliest = earliestSchedulingStart();
  let candidate = new Date(Math.max(date.getTime(), earliest.getTime()));

  while (true) {
    const dayStart = startOfWorkingDay(candidate);
    const dayEnd = endOfWorkingDay(candidate);

    if (candidate.getTime() < dayStart.getTime()) {
      candidate = dayStart;
      continue;
    }

    if (candidate.getTime() >= dayEnd.getTime()) {
      candidate = moveToNextWorkingDay(candidate);
      continue;
    }

    return candidate;
  }
}

function schedulingWindowOf(event: Event): { start: Date; end: Date | null } | null {
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

  const clampedStart = clampToWorkingHours(start);

  if (end && end.getTime() <= clampedStart.getTime()) {
    return null;
  }

  return { start: clampedStart, end };
}

function findNextSlot(durationMs: number, start: Date, end: Date | null, busy: BusyInterval[]): Date | null {
  const sorted = mergeBusyIntervals(busy);
  let cursor = clampToWorkingHours(start);
  const limit = end ? end.getTime() : Number.POSITIVE_INFINITY;

  if (cursor.getTime() >= limit) {
    return null;
  }

  while (cursor.getTime() + durationMs <= limit) {
    const dayEnd = endOfWorkingDay(cursor);

    if (cursor.getTime() + durationMs > dayEnd.getTime()) {
      cursor = moveToNextWorkingDay(cursor);
      if (cursor.getTime() >= limit) {
        return null;
      }
      continue;
    }

    let conflict: BusyInterval | null = null;
    for (const interval of sorted) {
      if (interval.end.getTime() <= cursor.getTime()) {
        continue;
      }

      if (interval.start.getTime() >= cursor.getTime() + durationMs) {
        break;
      }

      conflict = interval;
      break;
    }

    if (!conflict) {
      return cursor;
    }

    cursor = clampToWorkingHours(new Date(Math.max(conflict.end.getTime(), cursor.getTime())));
  }

  return null;
}

function upsertInterval(list: BusyInterval[], interval: BusyInterval): BusyInterval[] {
  const next = [...list, interval];
  return mergeBusyIntervals(next);
}

function upsertWeightedInterval(
  list: WeightedBusyInterval[],
  interval: WeightedBusyInterval
): WeightedBusyInterval[] {
  const next = [...list, interval];
  return mergeWeightedBusyIntervals(next);
}

function priorityWeight(priority: Priority): number {
  const idx = PRIORITY_ORDER.indexOf(priority);
  if (idx === -1) return 0;
  return PRIORITY_ORDER.length - idx;
}

function lowerPriorityTargets(priority: Priority): Priority[] {
  const base = priorityWeight(priority);
  return PRIORITY_ORDER.filter((candidate) => candidate !== 'OPCIONAL' && priorityWeight(candidate) < base);
}

async function preemptLowerPriorityEvents(userId: string, newEvents: Event[]) {
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
        canOverlap: false,
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
        OR: [{ isFixed: true }, { canOverlap: false }],
      },
    });

    let busy: BusyInterval[] = blockingEvents
      .filter((event) => !toMoveIds.has(event.id) && event.start && event.end)
      .map((event) => ({ start: event.start!, end: event.end! }));

    busy = mergeBusyIntervals(busy);

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
      const window = schedulingWindowOf(event);
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
      const nextSlot = findNextSlot(durationMs, window.start, window.end, busy);

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
      await prisma.$transaction(updates.map((update) => prisma.event.update({ where: { id: update.id }, data: update.data })));
    }
  }
}

async function scheduleFlexibleEvents(userId: string, candidates: Event[]) {
  const toSchedule = candidates.filter(
    (event) =>
      event.kind === 'EVENTO' &&
      event.participatesInScheduling &&
      !event.isFixed &&
      !event.canOverlap &&
      (event.priority === 'URGENTE' || event.priority === 'RELEVANTE') &&
      isUnsetDate(event.start)
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
      OR: [{ isFixed: true }, { canOverlap: false }],
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

  busy = mergeWeightedBusyIntervals(busy);

  const sorted = [...toSchedule].sort((a, b) => {
    const diff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const updates: { id: string; data: Prisma.EventUpdateInput }[] = [];

  for (const event of sorted) {
    const window = schedulingWindowOf(event);
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
    const effectiveBusy = mergeBusyIntervals(
      busy
        .filter((interval) => interval.weight >= candidateWeight)
        .map(({ start, end }) => ({ start, end }))
    );
    const nextSlot = findNextSlot(durationMs, window.start, window.end, effectiveBusy);

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
    await prisma.$transaction(updates.map((update) => prisma.event.update({ where: { id: update.id }, data: update.data })));
  }
}

async function resolveSchedulingConflicts(userId: string) {
  const candidates = await prisma.event.findMany({
    where: {
      userId,
      kind: 'EVENTO',
      priority: { in: RESCHEDULABLE_PRIORITIES },
      canOverlap: false,
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  if (!candidates.length) return;

  const updates: { id: string; data: Prisma.EventUpdateInput }[] = [];
  let busy: WeightedBusyInterval[] = [];

  const sorted = [...candidates].sort((a, b) => {
    const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (weightDiff !== 0) return weightDiff;

    const fixedDiff = Number(b.isFixed) - Number(a.isFixed);
    if (fixedDiff !== 0) return fixedDiff;

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  for (const event of sorted) {
    const weight = Math.max(1, priorityWeight(event.priority));

    if (event.isFixed || event.priority === 'CRITICA') {
      if (event.start && event.end) {
        busy = upsertWeightedInterval(busy, { start: event.start, end: event.end, weight });

        const normalization: Prisma.EventUpdateInput = {};
        if (event.participatesInScheduling !== true) normalization.participatesInScheduling = true;
        if (event.status !== 'SCHEDULED') normalization.status = 'SCHEDULED';

        if (Object.keys(normalization).length) {
          updates.push({ id: event.id, data: normalization });
        }
      } else {
        updates.push({
          id: event.id,
          data: {
            start: null,
            end: null,
            status: 'WAITLIST',
            participatesInScheduling: false,
          },
        });
      }
      continue;
    }

    const window = schedulingWindowOf(event);
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
    const effectiveBusy = busy
      .filter((interval) => interval.weight >= weight)
      .map(({ start, end }) => ({ start, end }));
    const nextSlot = findNextSlot(durationMs, window.start, window.end, effectiveBusy);

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

    busy = upsertWeightedInterval(busy, { start: nextSlot, end: nextEnd, weight });
  }

  if (updates.length) {
    await prisma.$transaction(
      updates.map((update) => prisma.event.update({ where: { id: update.id }, data: update.data }))
    );
  }
}

/** Genera todas las ocurrencias según regla y límites:
 * - DAILY/WEEKLY/MONTHLY: hasta el 31 de diciembre del año base
 * - YEARLY: hasta año base + 2 (inclusive)
 * Devuelve pares {start, end} comenzando con la ocurrencia base
 */
function buildSeries(
  baseStart: Date,
  baseEnd: Date | null,
  rule: RepeatRule
): Array<{ start: Date; end: Date | null }> {
  const out: Array<{ start: Date; end: Date | null }> = [];
  const duration = baseEnd ? (baseEnd.getTime() - baseStart.getTime()) : 0;

  const push = (s: Date) => {
    out.push({ start: s, end: baseEnd ? new Date(s.getTime() + duration) : null });
  };

  // primera ocurrencia
  push(baseStart);

  if (rule === 'NONE') return out;

  if (rule === 'YEARLY') {
    const maxYear = baseStart.getFullYear() + 2; // 2 años a futuro
    let cursor = new Date(baseStart);
    while (true) {
      const next = addPeriodSafe(cursor, 'YEARLY');
      if (next.getFullYear() > maxYear) break;
      push(next);
      cursor = next;
    }
    return out;
  }

  // DAILY / WEEKLY / MONTHLY -> hasta final del año base
  const limit = endOfYearOf(baseStart);
  let cursor = new Date(baseStart);
  while (true) {
    const next = addPeriodSafe(cursor, rule);
    if (next.getTime() > limit.getTime()) break;
    push(next);
    cursor = next;
  }
  return out;
}

/** ================= Schemas entrada ================= */
const EventCreateSchema_EVENTO = z.object({
  kind: z.literal('EVENTO'),
  title: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  category: z.string().nullish(),

  isInPerson: z.boolean().optional().default(true),
  canOverlap: z.boolean().optional().default(false),
  priority: PrioritySchema.default('RELEVANTE'),

  repeat: z.nativeEnum(RepeatRule).default('NONE'),

  start: zDate,  // requerido cuando repeat ≠ NONE
  end: zDate,

  window: z.nativeEnum(AvailabilityWindow).default('NONE'),
  windowStart: zDate,
  windowEnd: zDate,

  isFixed: z.boolean().optional(),
  participatesInScheduling: z.boolean().optional(),
  transparency: z.string().optional(),
  status: z.string().optional(),

  calendarId: z.string().nullish(),
});


const EventCreateSchema_TAREA = z.object({
  kind: z.literal('TAREA'),
  title: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  category: z.string().nullish(),

  repeat: z.nativeEnum(RepeatRule).default('NONE'),
  dueDate: zDate, // requerido cuando repeat ≠ NONE

  priority: PrioritySchema.optional().default('RELEVANTE'),
  todoStatus: z.nativeEnum(ICalTodoStatus).optional().default('NEEDS_ACTION'),
  calendarId: z.string().nullish(),
});

// Agregar después de EventCreateSchema_TAREA y antes de EventCreateSchema

const EventCreateSchema_RECORDATORIO = z.object({
  kind: z.literal('RECORDATORIO'),
  title: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  category: z.string().nullish(),

  repeat: z.nativeEnum(RepeatRule).default('NONE'),
  isAllDay: z.boolean().default(false),
  start: zDate,      // fecha opcional para recordatorios
  end: zDate,        // hora fin opcional
  calendarId: z.string().nullish(),
});

// Modificar EventCreateSchema para incluir RECORDATORIO:
const EventCreateSchema = z.discriminatedUnion('kind', [
  EventCreateSchema_EVENTO,
  EventCreateSchema_TAREA,
  EventCreateSchema_RECORDATORIO,  // ← Agregar esta línea
]);

/** ============== creación series RECORDATORIO ============== */
async function createReminderSeries(userId: string, data: z.infer<typeof EventCreateSchema_RECORDATORIO>) {
  const normalizedStart = data.start ? normalizeToUTC(data.start) : null;
  const normalizedEnd = data.end ? normalizeToUTC(data.end) : null;

  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !normalizedStart) {
    throw new Error('Para repetir un recordatorio debes proporcionar una fecha de inicio.');
  }

  const baseStart = normalizedStart ?? null;
  const series = baseStart ? buildSeries(baseStart, normalizedEnd ?? null, data.repeat) : [{ start: null as any, end: null }];

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'RECORDATORIO',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      start: series[0].start ?? null,
      end: series[0].end ?? null,
      isAllDay: data.isAllDay,

      repeat: data.repeat,
      rrule:
        needsSeries && normalizedStart
          ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${normalizedStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
          : null,

      priority: 'OPCIONAL',
      window: 'NONE',
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,

      status: 'SCHEDULED',
      tzid: 'UTC',  // Siempre UTC
    },
  });

  if (!needsSeries || series.length === 1) return [master];

  const tx = series.slice(1).map(({ start, end }) =>
    prisma.event.create({
      data: {
        userId,
        calendarId: data.calendarId ?? null,
        kind: 'RECORDATORIO',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        start,
        end,
        isAllDay: data.isAllDay,

        repeat: 'NONE',
        rrule: null,
        originEventId: master.id,

        priority: 'OPCIONAL',
        window: 'NONE',
        isFixed: false,
        isInPerson: false,
        canOverlap: true,
        participatesInScheduling: false,

        status: 'SCHEDULED',
        tzid: 'UTC',
      },
    })
  );

  const children = await prisma.$transaction(tx);
  return [master, ...children];
}

type EventCreatePayload = z.infer<typeof EventCreateSchema_EVENTO>;

function applyPriorityPolicyToEventCreate(data: EventCreatePayload): EventCreatePayload {
  const policy = priorityPolicy(data.priority);
  const next: EventCreatePayload = { ...data };

  next.participatesInScheduling = policy.participatesInScheduling;
  next.isFixed = policy.isFixed;

  if (policy.status === 'WAITLIST') {
    next.status = 'WAITLIST';

    const startValue = next.start as Date | null | undefined;
    const endValue = next.end as Date | null | undefined;

    next.start = startValue && !isUnsetDate(startValue) ? startValue : null;
    next.end = endValue && !isUnsetDate(endValue) ? endValue : null;

    next.window = 'NONE';
    next.windowStart = null;
    next.windowEnd = null;
    next.canOverlap = true;
  } else {
    next.status = next.status ?? 'SCHEDULED';
  }

  if (policy.isFixed) {
    next.canOverlap = false;
  }

  return next;
}

/** ============== creación series EVENTO ============== */
async function createEventSeries(userId: string, data: z.infer<typeof EventCreateSchema_EVENTO>) {
  // Normalizar TODAS las fechas a UTC
  const normalizedStart = data.start ? normalizeToUTC(data.start) : null;
  const normalizedEnd = data.end ? normalizeToUTC(data.end) : null;
  const normalizedWindowStart = data.windowStart ? normalizeToUTC(data.windowStart) : null;
  const normalizedWindowEnd = data.windowEnd ? normalizeToUTC(data.windowEnd) : null;

  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !normalizedStart) {
    throw new Error('Para repetir un evento debes proporcionar fecha y hora de inicio (start).');
  }

  // RRULE usando UTC
  const rrule =
    needsSeries && normalizedStart
      ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${normalizedStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
      : null;

  const baseStart = normalizedStart ?? null;
  const series = baseStart ? buildSeries(baseStart, normalizedEnd ?? null, data.repeat) : [{ start: null as any, end: null }];

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'EVENTO',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      isInPerson: data.isInPerson,
      canOverlap: data.canOverlap ?? false,

      priority: data.priority,
      repeat: data.repeat,
      rrule,

      start: series[0].start ?? null,
      end: series[0].end ?? null,

      window: data.window,
      windowStart: normalizedWindowStart,
      windowEnd: normalizedWindowEnd,

      isFixed: data.isFixed ?? false,
      participatesInScheduling: data.participatesInScheduling ?? true,
      transparency: (data.transparency as any) ?? null,
      status: data.status ?? 'SCHEDULED',

      tzid: 'UTC',  // Siempre UTC
      isAllDay: false,
    },
  });

  if (!needsSeries || series.length === 1) return [master];

  // Instancias hijas planas (repeat = NONE)
  const tx = series.slice(1).map(({ start, end }) =>
    prisma.event.create({
      data: {
        userId,
        calendarId: data.calendarId ?? null,
        kind: 'EVENTO',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        isInPerson: data.isInPerson,
        canOverlap: data.canOverlap ?? false,

        priority: data.priority,
        repeat: 'NONE',
        rrule: null,
        originEventId: master.id,

        start,
        end,

        window: data.window,
        windowStart: normalizedWindowStart,
        windowEnd: normalizedWindowEnd,

        isFixed: data.isFixed ?? false,
        participatesInScheduling: data.participatesInScheduling ?? true,
        transparency: (data.transparency as any) ?? null,
        status: data.status ?? 'SCHEDULED',

        tzid: 'UTC',
        isAllDay: false,
      },
    })
  );

  const children = await prisma.$transaction(tx);
  return [master, ...children];
}

/** ============== creación series TAREA (VTODO) ============== */
async function createTaskSeries(userId: string, data: z.infer<typeof EventCreateSchema_TAREA>) {
  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !data.dueDate) {
    throw new Error('Para repetir una tarea debes proporcionar dueDate base.');
  }

  const baseDue = data.dueDate ?? null;
  const durationlessSeries = baseDue ? buildSeries(baseDue, null, data.repeat) : [{ start: null as any, end: null }];

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'TAREA',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      dueDate: durationlessSeries[0].start ?? null,
      todoStatus: data.todoStatus ?? 'NEEDS_ACTION',
      completed: false,
      percentComplete: 0,

      priority: data.priority ?? 'RELEVANTE',
      repeat: data.repeat,
      rrule:
        needsSeries && data.dueDate
          ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${data.dueDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
          : null,

      // campos no aplicables a TAREA
      start: null,
      end: null,
      window: 'NONE',
      isFixed: false,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: false,
      isAllDay: false,

      status: 'SCHEDULED',
      tzid: 'UTC',
    },
  });

  if (!needsSeries || durationlessSeries.length === 1) return [master];

  const tx = durationlessSeries.slice(1).map(({ start }) =>
    prisma.event.create({
      data: {
        userId,
        calendarId: data.calendarId ?? null,
        kind: 'TAREA',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        dueDate: start,
        todoStatus: data.todoStatus ?? 'NEEDS_ACTION',
        completed: false,
        percentComplete: 0,

        priority: data.priority ?? 'RELEVANTE',
        repeat: 'NONE',
        rrule: null,
        originEventId: master.id,

        start: null,
        end: null,
        window: 'NONE',
        isFixed: false,
        isInPerson: true,
        canOverlap: false,
        participatesInScheduling: false,
        isAllDay: false,

        status: 'SCHEDULED',
        tzid: 'UTC',
      },
    })
  );

  const children = await prisma.$transaction(tx);
  return [master, ...children];
}

/** ================== handlers ================== */
export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const sanitized = sanitizeEventPayload(raw, { treatMissingPriorityAsOptionalHint: true });
    const parsed = EventCreateSchema.safeParse(sanitized);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const user = await ensureDemoUser();

    let items;
    if (data.kind === 'EVENTO') {
      const normalized = applyPriorityPolicyToEventCreate(data);
      const created = await createEventSeries(user.id, normalized);
      const createdIds = created.map((item) => item.id);
      await resolveSchedulingConflicts(user.id);
      const refreshed = await prisma.event.findMany({ where: { id: { in: createdIds } } });
      const byId = new Map(refreshed.map((item) => [item.id, item]));
      items = createdIds.map((id) => byId.get(id)).filter((item): item is Event => Boolean(item));
    } else if (data.kind === 'TAREA') {
      items = await createTaskSeries(user.id, data);
    } else if (data.kind === 'RECORDATORIO') {
      // ← Agregar manejo para RECORDATORIO
      items = await createReminderSeries(user.id, data);
    } else {
      throw new Error('Invalid event kind');
    }
    
    return NextResponse.json({ count: items.length, items }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/events error', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') ?? 'user';

    const where: any = {};
    if (scope === 'user') {
      const demo = await prisma.user.findUnique({ where: { email: 'demo@local' } });
      if (demo) where.userId = demo.id;
    }

    const rows = await prisma.event.findMany({
      where,
      orderBy: [{ start: 'asc' }, { createdAt: 'desc' }],
      take: 5000,
    });

    // ✅ GARANTIZAR que todas las fechas sean ISO strings
    const normalized = rows.map((event) => ({
      ...event,
      start: event.start ? event.start.toISOString() : null,
      end: event.end ? event.end.toISOString() : null,
      dueDate: event.dueDate ? event.dueDate.toISOString() : null,
      windowStart: event.windowStart ? event.windowStart.toISOString() : null,
      windowEnd: event.windowEnd ? event.windowEnd.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      lastModified: event.lastModified ? event.lastModified.toISOString() : null,
      createdIcal: event.createdIcal ? event.createdIcal.toISOString() : null,
      completedAt: event.completedAt ? event.completedAt.toISOString() : null,
    }));

    return NextResponse.json(normalized);
  } catch (e) {
    console.error('GET /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}