import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  AvailabilityWindow,
  Priority,
  RepeatRule,
  ICalTodoStatus,
  Prisma,
  Event,
} from '@prisma/client';

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
  priority: z.nativeEnum(Priority).optional(),

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
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data as any;

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

const DEFAULT_DURATION_MINUTES = 60;

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

  if (end && end.getTime() <= start.getTime()) {
    return null;
  }

  return { start, end };
}

function findNextSlot(durationMs: number, start: Date, end: Date | null, busy: BusyInterval[]): Date | null {
  let cursor = new Date(start);
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const interval of sorted) {
    if (interval.end.getTime() <= cursor.getTime()) {
      continue;
    }

    if (end && cursor.getTime() + durationMs > end.getTime()) {
      return null;
    }

    if (interval.start.getTime() >= cursor.getTime() + durationMs) {
      return cursor;
    }

    cursor = new Date(Math.max(cursor.getTime(), interval.end.getTime()));
  }

  if (end && cursor.getTime() + durationMs > end.getTime()) {
    return null;
  }

  return cursor;
}

function upsertInterval(list: BusyInterval[], interval: BusyInterval): BusyInterval[] {
  const next = [...list, interval];
  next.sort((a, b) => a.start.getTime() - b.start.getTime());
  return next;
}

function priorityWeight(p: Priority): number {
  switch (p) {
    case 'CRITICA':
      return 3;
    case 'URGENTE':
      return 2;
    case 'RELEVANTE':
      return 1;
    default:
      return 0;
  }
}

async function preemptConflictingEvents(userId: string, criticalEvents: Event[]) {
  for (const critical of criticalEvents) {
    if (critical.priority !== 'CRITICA' || !critical.start || !critical.end) continue;

    const overlapping = await prisma.event.findMany({
      where: {
        userId,
        id: { not: critical.id },
        kind: 'EVENTO',
        participatesInScheduling: true,
        isFixed: false,
        canOverlap: false,
        priority: { in: ['URGENTE', 'RELEVANTE'] },
        start: { lt: critical.end },
        end: { gt: critical.start },
      },
    });

    if (!overlapping.length) continue;

    const toMoveIds = new Set(overlapping.map((e) => e.id));

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
      .filter((e) => !toMoveIds.has(e.id) && e.start && e.end)
      .map((e) => ({ start: e.start!, end: e.end! }));

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
      await prisma.$transaction(updates.map((u) => prisma.event.update({ where: { id: u.id }, data: u.data })));
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

  let busy: BusyInterval[] = blockingEvents
    .filter((event) => event.start && event.end)
    .map((event) => ({ start: event.start!, end: event.end! }));

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

  isInPerson: z.boolean(),
  canOverlap: z.boolean().optional().default(false),
  priority: z.nativeEnum(Priority).default('RELEVANTE'),

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

  priority: z.nativeEnum(Priority).optional().default('RELEVANTE'),
  todoStatus: z.nativeEnum(ICalTodoStatus).optional().default('NEEDS_ACTION'),
  calendarId: z.string().nullish(),
});

const EventCreateSchema = z.discriminatedUnion('kind', [
  EventCreateSchema_EVENTO,
  EventCreateSchema_TAREA,
]);

/** ============== creación series EVENTO ============== */
async function createEventSeries(userId: string, data: z.infer<typeof EventCreateSchema_EVENTO>) {
  const normalizedStart = data.start && !isUnsetDate(data.start) ? data.start : null;
  const normalizedEnd = data.end && !isUnsetDate(data.end) ? data.end : null;
  const normalizedWindowStart = data.windowStart && !isUnsetDate(data.windowStart) ? data.windowStart : null;
  const normalizedWindowEnd = data.windowEnd && !isUnsetDate(data.windowEnd) ? data.windowEnd : null;

  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !normalizedStart) {
    throw new Error('Para repetir un evento debes proporcionar fecha y hora de inicio (start).');
  }

  // RRULE opcional en el master (informativo)
  const rrule =
    needsSeries && normalizedStart
      ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${normalizedStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
      : null;

  const baseStart = normalizedStart ?? null;
  const series = baseStart ? buildSeries(baseStart, normalizedEnd ?? null, data.repeat) : [{ start: null as any, end: null }];

  // Crea master = primera ocurrencia
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

      tzid: 'UTC',
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
    const parsed = EventCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const user = await ensureDemoUser();

    let items;
    if (data.kind === 'EVENTO') {
      const created = await createEventSeries(user.id, data);
      await scheduleFlexibleEvents(user.id, created);
      await preemptConflictingEvents(user.id, created);
      const ids = created.map((item) => item.id);
      const refreshed = await prisma.event.findMany({ where: { id: { in: ids } } });
      const byId = new Map(refreshed.map((item) => [item.id, item]));
      items = ids.map((id) => byId.get(id)).filter((item): item is Event => Boolean(item));
    } else {
      items = await createTaskSeries(user.id, data);
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
    return NextResponse.json(rows);
  } catch (e) {
    console.error('GET /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
