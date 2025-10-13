import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  AvailabilityWindow,
  Priority,
  RepeatRule,
  ICalTodoStatus,
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
  const needsSeries = data.repeat !== 'NONE';
  if (needsSeries && !data.start) {
    throw new Error('Para repetir un evento debes proporcionar fecha y hora de inicio (start).');
  }

  // RRULE opcional en el master (informativo)
  const rrule =
    needsSeries && data.start
      ? `FREQ=${data.repeat};INTERVAL=1;DTSTART=${data.start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
      : null;

  const baseStart = data.start ?? null;
  const series = baseStart ? buildSeries(baseStart, data.end ?? null, data.repeat) : [{ start: null as any, end: null }];

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
      windowStart: data.windowStart ?? null,
      windowEnd: data.windowEnd ?? null,

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
        windowStart: data.windowStart ?? null,
        windowEnd: data.windowEnd ?? null,

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
      items = await createEventSeries(user.id, data);
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
