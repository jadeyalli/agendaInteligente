import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  buildSchedulingContext,
  isUnsetDate,
  loadSchedulingPreferences,
  preemptLowerPriorityEvents,
  scheduleFlexibleEvents,
} from '@/lib/scheduling-engine';
import {
  AvailabilityWindow,
  Priority,
  RepeatRule,
  ICalTodoStatus,
  ICalTransparency,
  Prisma,
  Event,
} from '@prisma/client';

const REMINDER_PRIORITY = 'RECORDATORIO' as unknown as Priority;

const PRIORITY_ALIAS_MAP: Record<string, Priority> = {
  UI: 'CRITICA',
  UNI: 'URGENTE',
  INU: 'RELEVANTE',
  NN: 'OPCIONAL',
  REMINDER: REMINDER_PRIORITY,
  REMINDERS: REMINDER_PRIORITY,
  RECORDATORIOS: REMINDER_PRIORITY,
};

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

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
}

function sanitizeEventPayload(
  raw: unknown,
  options: { treatMissingPriorityAsOptionalHint?: boolean } = {}
): unknown {
  if (!isPlainObject(raw)) return raw;

  const clone: Record<string, unknown> = { ...raw };

  const booleanKeys = ['participatesInScheduling', 'isFixed'] as const;
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
    return normalized === 'RECORDATORIO'
      ? (REMINDER_PRIORITY as Priority)
      : (normalized as Priority);
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
    case REMINDER_PRIORITY:
      return { participatesInScheduling: false, isFixed: false, status: 'SCHEDULED' };
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

    const user = await getSessionUser();
    if (!user) {
      return unauthorized();
    }

    const target = await prisma.event.findUnique({ where: { id } });
    if (!target || target.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (cascade === 'series') {
      // si es master, borra master + hijas; si es hija, borra su master y la serie
      const masterId = target.originEventId ?? target.id;
      await prisma.event.deleteMany({
        where: {
          userId: user.id,
          OR: [{ id: masterId }, { originEventId: masterId }],
        },
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
  durationMinutes: z.union([z.number().int().positive(), z.null()]).optional(),
  isAllDay: z.boolean().optional(),
  isFixed: z.boolean().optional(),

  // tarea
  dueDate: z.union([z.coerce.date(), z.null()]).optional(),
  todoStatus: z.nativeEnum(ICalTodoStatus).optional(),

  // comportamiento
  participatesInScheduling: z.boolean().optional(),
  status: z.string().optional(),

  // ventana
  window: z.nativeEnum(AvailabilityWindow).optional(),
  windowStart: z.union([z.coerce.date(), z.null()]).optional(),
  windowEnd: z.union([z.coerce.date(), z.null()]).optional(),
});

type PatchPayload = z.infer<typeof PatchSchema>;

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const user = await getSessionUser();
    if (!user) {
      return unauthorized();
    }

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const raw = await req.json().catch(() => ({}));
    const sanitized = sanitizeEventPayload(raw);
    const parsed = PatchSchema.safeParse(sanitized);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const data: PatchPayload = { ...parsed.data };

    if (data.priority) {
      const policy = priorityPolicy(data.priority);
      data.participatesInScheduling = policy.participatesInScheduling;
      data.isFixed = policy.isFixed;

      if (data.priority === REMINDER_PRIORITY) {
        data.status = data.status ?? 'SCHEDULED';
        data.window = 'NONE';
        data.windowStart = null;
        data.windowEnd = null;
      } else if (policy.status === 'WAITLIST') {
        data.status = 'WAITLIST';
        data.start = null;
        data.end = null;
        data.window = 'NONE';
        data.windowStart = null;
        data.windowEnd = null;
      } else {
        data.status = data.status ?? 'SCHEDULED';
      }
    }

    // Normaliza nullables a undefined para Prisma si no se quiere tocar
    const updated = await prisma.event.update({
      where: { id },
      data: {
        title: data.title,
        description: data.hasOwnProperty('description') ? data.description : undefined,
        category: data.hasOwnProperty('category') ? data.category : undefined,
        priority: data.priority,

        start: data.hasOwnProperty('start') ? data.start : undefined,
        end: data.hasOwnProperty('end') ? data.end : undefined,
        durationMinutes: data.hasOwnProperty('durationMinutes') ? data.durationMinutes : undefined,
        isAllDay: data.isAllDay,

        dueDate: data.hasOwnProperty('dueDate') ? data.dueDate : undefined,
        todoStatus: data.todoStatus,

        participatesInScheduling: data.participatesInScheduling,
        isFixed: data.isFixed,
        canOverlap: data.priority ? (data.priority === REMINDER_PRIORITY ? true : false) : undefined,
        status: data.status,

        window: data.window,
        windowStart: data.hasOwnProperty('windowStart') ? data.windowStart : undefined,
        windowEnd: data.hasOwnProperty('windowEnd') ? data.windowEnd : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('PATCH /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
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

  priority: PrioritySchema.default('RELEVANTE'),

  repeat: z.nativeEnum(RepeatRule).default('NONE'),

  start: zDate,  // requerido cuando repeat ≠ NONE
  end: zDate,
  durationMinutes: z.number().int().positive().nullish(),
  isAllDay: z.boolean().optional(),
  tzid: z.string().trim().min(1).optional(),

  window: z.nativeEnum(AvailabilityWindow).default('NONE'),
  windowStart: zDate,
  windowEnd: zDate,

  isFixed: z.boolean().optional(),
  participatesInScheduling: z.boolean().optional(),
  status: z.string().optional(),
  transparency: z.nativeEnum(ICalTransparency).nullish(),
  canOverlap: z.boolean().optional(),
  isInPerson: z.boolean().optional(),

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
  tzid: z.string().trim().min(1).optional(),
  calendarId: z.string().nullish(),
});

// Modificar EventCreateSchema para incluir RECORDATORIO:
const EventCreateSchema = z.discriminatedUnion('kind', [
  EventCreateSchema_EVENTO,
  EventCreateSchema_TAREA,
  EventCreateSchema_RECORDATORIO,  // ← Agregar esta línea
]);

type EventCreatePayload = z.infer<typeof EventCreateSchema_EVENTO>;

function applyPriorityPolicyToEventCreate(data: EventCreatePayload): EventCreatePayload {
  const policy = priorityPolicy(data.priority);
  const next: EventCreatePayload = { ...data };

  next.participatesInScheduling = policy.participatesInScheduling;
  next.isFixed = policy.isFixed;
  next.status = policy.status;

  if (next.priority === REMINDER_PRIORITY) {
    next.participatesInScheduling = false;
    next.isFixed = false;
    next.status = 'SCHEDULED';
    next.window = 'NONE';
    next.windowStart = null;
    next.windowEnd = null;
    return next;
  }

  if (policy.status === 'WAITLIST') {
    next.status = 'WAITLIST';

    const startValue = next.start as Date | null | undefined;
    const endValue = next.end as Date | null | undefined;

    next.start = startValue && !isUnsetDate(startValue) ? startValue : null;
    next.end = endValue && !isUnsetDate(endValue) ? endValue : null;

    next.window = 'NONE';
    next.windowStart = null;
    next.windowEnd = null;
  } else {
    next.status = next.status ?? 'SCHEDULED';
  }

  return next;
}

/** ============== creación series EVENTO ============== */
async function createEventSeries(userId: string, data: z.infer<typeof EventCreateSchema_EVENTO>) {
  const normalizedStart = data.start && !isUnsetDate(data.start) ? data.start : null;
  const normalizedEnd = data.end && !isUnsetDate(data.end) ? data.end : null;
  const normalizedWindowStart = data.windowStart && !isUnsetDate(data.windowStart) ? data.windowStart : null;
  const normalizedWindowEnd = data.windowEnd && !isUnsetDate(data.windowEnd) ? data.windowEnd : null;
  const allowOverlap = data.priority === REMINDER_PRIORITY;
  const tzid = typeof data.tzid === 'string' && data.tzid.trim() ? data.tzid.trim() : 'UTC';

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
  const occurrences = baseStart
    ? buildSeries(baseStart, normalizedEnd ?? null, data.repeat)
    : [
        {
          start: normalizedStart ?? null,
          end: normalizedEnd ?? null,
        },
      ];

  const [firstOccurrence, ...restOccurrences] = occurrences;
  const firstStart = firstOccurrence?.start ?? null;
  const firstEnd = firstOccurrence?.end ?? null;

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'EVENTO',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      isInPerson: true,
      canOverlap: allowOverlap,

      priority: data.priority,
      repeat: data.repeat,
      rrule,

      start: firstStart,
      end: firstEnd,

      window: data.window,
      windowStart: normalizedWindowStart,
      windowEnd: normalizedWindowEnd,

      durationMinutes: data.durationMinutes ?? null,

      isFixed: data.isFixed ?? false,
      participatesInScheduling: data.participatesInScheduling ?? true,
      transparency: data.transparency ?? null,
      status: data.status ?? 'SCHEDULED',

      tzid,
      isAllDay: Boolean(data.isAllDay),
    },
  });

  if (!needsSeries || restOccurrences.length === 0) return [master];

  // Instancias hijas planas (repeat = NONE)
  const tx = restOccurrences.map(({ start, end }) =>
    prisma.event.create({
      data: {
        userId,
        calendarId: data.calendarId ?? null,
        kind: 'EVENTO',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        isInPerson: true,
        canOverlap: allowOverlap,

        priority: data.priority,
        repeat: 'NONE',
        rrule: null,
        originEventId: master.id,

        start,
        end,

        window: data.window,
        windowStart: normalizedWindowStart,
        windowEnd: normalizedWindowEnd,

        durationMinutes: data.durationMinutes ?? null,

        isFixed: data.isFixed ?? false,
        participatesInScheduling: data.participatesInScheduling ?? true,
        transparency: data.transparency ?? null,
        status: data.status ?? 'SCHEDULED',

        tzid,
        isAllDay: Boolean(data.isAllDay),
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
  const durationlessSeries = baseDue ? buildSeries(baseDue, null, data.repeat) : [];
  const firstDue = durationlessSeries.length ? durationlessSeries[0].start : null;

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'TAREA',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      dueDate: firstDue,
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

  if (!needsSeries || durationlessSeries.length <= 1) return [master];

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

/** ============== creación series RECORDATORIO ============== */
async function createReminderSeries(
  userId: string,
  data: z.infer<typeof EventCreateSchema_RECORDATORIO>,
) {
  const normalizedStart = data.start && !isUnsetDate(data.start) ? data.start : null;
  const normalizedEnd = data.end && !isUnsetDate(data.end) ? data.end : null;
  const tzid = typeof data.tzid === 'string' && data.tzid.trim() ? data.tzid.trim() : 'UTC';

  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !normalizedStart) {
    throw new Error('Para repetir un recordatorio debes proporcionar fecha de inicio.');
  }

  const occurrences = normalizedStart
    ? buildSeries(normalizedStart, normalizedEnd ?? null, data.repeat)
    : [
        {
          start: normalizedStart,
          end: normalizedEnd,
        },
      ];

  const [firstOccurrence, ...restOccurrences] = occurrences;
  const firstStart = firstOccurrence?.start ?? normalizedStart ?? null;
  const firstEnd = firstOccurrence?.end ?? normalizedEnd ?? null;

  const master = await prisma.event.create({
    data: {
      userId,
      calendarId: data.calendarId ?? null,
      kind: 'RECORDATORIO',
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,

      priority: REMINDER_PRIORITY,
      repeat: data.repeat,
      rrule:
        needsSeries && normalizedStart
          ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${normalizedStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
          : null,

      start: firstStart,
      end: firstEnd,
      isAllDay: Boolean(data.isAllDay),
      tzid,

      isInPerson: true,
      canOverlap: true,
      participatesInScheduling: false,
      isFixed: false,
      transparency: 'TRANSPARENT',
      status: 'SCHEDULED',

      window: 'NONE',
      windowStart: null,
      windowEnd: null,
    },
  });

  if (!needsSeries || restOccurrences.length === 0) return [master];

  const tx = restOccurrences.map(({ start, end }) =>
    prisma.event.create({
      data: {
        userId,
        calendarId: data.calendarId ?? null,
        kind: 'RECORDATORIO',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        priority: REMINDER_PRIORITY,
        repeat: 'NONE',
        rrule: null,
        originEventId: master.id,

        start,
        end,
        isAllDay: Boolean(data.isAllDay),
        tzid,

        isInPerson: true,
        canOverlap: true,
        participatesInScheduling: false,
        isFixed: false,
        transparency: 'TRANSPARENT',
        status: 'SCHEDULED',

        window: 'NONE',
        windowStart: null,
        windowEnd: null,
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
    const user = await getSessionUser();
    if (!user) {
      return unauthorized();
    }

    const requestedCalendarId =
      typeof data.calendarId === 'string' && data.calendarId.trim() ? data.calendarId.trim() : null;

    let calendarIdToUse: string | null = null;
    if (requestedCalendarId) {
      const calendar = await prisma.calendar.findFirst({ where: { id: requestedCalendarId, userId: user.id } });
      if (!calendar) {
        return NextResponse.json({ error: 'Calendario no válido.' }, { status: 400 });
      }
      calendarIdToUse = calendar.id;
    } else {
      let calendar = await prisma.calendar.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });

      if (!calendar) {
        calendar = await prisma.calendar.create({
          data: { userId: user.id, name: 'Calendario principal', color: '#6366F1' },
        });
      }

      calendarIdToUse = calendar.id;
    }

    let items: Event[];
    if (data.kind === 'EVENTO') {
      const schedulingPreferences = await loadSchedulingPreferences(user.id);
      const schedulingContext = buildSchedulingContext(schedulingPreferences);
      const normalized = applyPriorityPolicyToEventCreate({ ...data, calendarId: calendarIdToUse });
      const created = await createEventSeries(user.id, normalized);
      await scheduleFlexibleEvents(user.id, created, schedulingContext);
      const createdIds = created.map((item) => item.id);
      const scheduled = await prisma.event.findMany({ where: { id: { in: createdIds } } });
      await preemptLowerPriorityEvents(user.id, scheduled, schedulingContext);
      const refreshed = await prisma.event.findMany({ where: { id: { in: createdIds } } });
      const byId = new Map(refreshed.map((item) => [item.id, item]));
      items = createdIds.map((id) => byId.get(id)).filter((item): item is Event => Boolean(item));
    } else if (data.kind === 'TAREA') {
      items = await createTaskSeries(user.id, { ...data, calendarId: calendarIdToUse });
    } else if (data.kind === 'RECORDATORIO') {
      items = await createReminderSeries(user.id, { ...data, calendarId: calendarIdToUse });
    } else {
      throw new Error('Invalid event kind');
    }
    
    return NextResponse.json({ count: items.length, items }, { status: 201 });
  } catch (e: unknown) {
    console.error('POST /api/events error', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const calendarFilter = searchParams.get('calendarId');

    const where: Prisma.EventWhereInput = { userId: user.id };

    if (calendarFilter && calendarFilter !== 'all') {
      if (calendarFilter === 'none') {
        where.calendarId = null;
      } else {
        const trimmed = calendarFilter.trim();
        if (trimmed) {
          const calendar = await prisma.calendar.findFirst({ where: { id: trimmed, userId: user.id } });
          if (!calendar) {
            return NextResponse.json({ error: 'Calendario no encontrado' }, { status: 404 });
          }
          where.calendarId = trimmed;
        }
      }
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
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}