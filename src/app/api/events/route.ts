import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  AvailabilityWindow,
  EventKind,
  Priority,
  RepeatRule,
  ICalTodoStatus,
} from '@prisma/client';

/** Util: asegura un usuario demo para poder crear sin auth */
async function ensureDemoUser() {
  const email = 'demo@local';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: 'Demo' },
    });
  }
  return user;
}

/** Zod comunes */
const zDate = z.union([
  z.coerce.date(), // acepta Date o string ISO
  z.null(),
  z.undefined(),
]);

/** Payload para EVENTO (kind: EVENTO) */
const EventCreateSchema_EVENTO = z.object({
  kind: z.literal('EVENTO'),
  title: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  category: z.string().nullish(),

  isInPerson: z.boolean(),
  canOverlap: z.boolean().optional().default(false),
  priority: z.nativeEnum(Priority).default('RELEVANTE'),
  repeat: z.nativeEnum(RepeatRule).default('NONE'),

  start: zDate,
  end: zDate,

  window: z.nativeEnum(AvailabilityWindow).default('NONE'),
  windowStart: zDate,
  windowEnd: zDate,

  isFixed: z.boolean().optional(),
  participatesInScheduling: z.boolean().optional(),
  transparency: z.string().optional(),
  status: z.string().optional(),

  // opcionalmente desde el cliente
  calendarId: z.string().nullish(),
});

/** Payload para TAREA (kind: TAREA) */
const EventCreateSchema_TAREA = z.object({
  kind: z.literal('TAREA'),
  title: z.string().trim().min(1),
  description: z.string().trim().nullish(),
  category: z.string().nullish(),
  repeat: z.nativeEnum(RepeatRule).default('NONE'),
  dueDate: zDate,
  // Defaults razonables para TAREA en tu modelo:
  priority: z.nativeEnum(Priority).optional().default('RELEVANTE'),
  todoStatus: z.nativeEnum(ICalTodoStatus).optional().default('NEEDS_ACTION'),
  calendarId: z.string().nullish(),
});

/** Union de payloads soportados */
const EventCreateSchema = z.discriminatedUnion('kind', [
  EventCreateSchema_EVENTO,
  EventCreateSchema_TAREA,
]);

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = EventCreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const user = await ensureDemoUser(); // usa tu usuario real si tienes auth

    if (data.kind === 'EVENTO') {
      const created = await prisma.event.create({
        data: {
          userId: user.id,
          calendarId: data.calendarId ?? null,
          kind: 'EVENTO',
          title: data.title,
          description: data.description ?? null,
          category: data.category ?? null,

          isInPerson: data.isInPerson,
          canOverlap: data.canOverlap ?? false,

          priority: data.priority,
          repeat: data.repeat,

          start: data.start ?? null,
          end: data.end ?? null,

          window: data.window,
          windowStart: data.windowStart ?? null,
          windowEnd: data.windowEnd ?? null,

          isFixed: data.isFixed ?? false,
          participatesInScheduling: data.participatesInScheduling ?? true,
          transparency: data.transparency as any, // opcional
          status: data.status ?? 'SCHEDULED',

          // defaults sensatos
          tzid: 'UTC',
          isAllDay: false,
        },
      });
      return NextResponse.json(created, { status: 201 });
    }

    // kind === 'TAREA'
    const created = await prisma.event.create({
      data: {
        userId: user.id,
        calendarId: data.calendarId ?? null,
        kind: 'TAREA',
        title: data.title,
        description: data.description ?? null,
        category: data.category ?? null,

        // campos de tareas
        dueDate: data.dueDate ?? null,
        todoStatus: data.todoStatus ?? 'NEEDS_ACTION',
        completed: false,
        percentComplete: 0,

        // defaults para cumplir con el schema
        priority: data.priority ?? 'RELEVANTE',
        repeat: data.repeat ?? 'NONE',

        // no es un evento de tiempo fijo por defecto
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
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error('POST /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') ?? 'user'; // 'user' | 'all'

    let where: any = {};
    if (scope === 'user') {
      // si tienes auth real, usa el userId real
      const demo = await prisma.user.findUnique({ where: { email: 'demo@local' } });
      if (demo) where.userId = demo.id;
      // si no existe el demo, caerá en devolver TODO igualmente
    }

    const rows = await prisma.event.findMany({
      where,
      orderBy: [{ start: 'asc' }, { createdAt: 'desc' }],
      take: 2000,
    });

    return NextResponse.json(rows);
  } catch (e) {
    console.error('GET /api/events error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

