import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AvailabilityWindow, EventKind, Priority, RepeatRule } from '@prisma/client';

const DEMO_USER = 'demo-user';

export async function GET() {
  const events = await prisma.event.findMany({
    where: { userId: DEMO_USER },
    orderBy: { start: 'asc' },
  });
  return NextResponse.json(events);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Entrada esperada (algunas opcionales)
    const {
      title,
      description,
      priority,              // 'CRITICA' | 'URGENTE' | 'RELEVANTE' | 'OPCIONAL'
      category,              // string?
      isInPerson,            // boolean
      canOverlap,            // boolean (si no viene: !isInPerson)
      start,                 // ISO opcional
      end,                   // ISO opcional
      repeat,                // 'NONE'|'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY'
      window,                // 'PRONTO'|'SEMANA'|'MES'|'RANGO'|'NONE'
      windowStart,           // ISO opcional
      windowEnd,             // ISO opcional
      kind,                  // 'EVENTO'|'TAREA'|'SOLICITUD'
      status,                // string opcional (ej. 'PENDING')
      shareLink,             // string opcional
    } = body || {};

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title es obligatorio' }, { status: 400 });
    }

    // Normaliza enums seguros hacia Prisma
    const safePriority: Priority = (priority && ['CRITICA','URGENTE','RELEVANTE','OPCIONAL'].includes(priority))
      ? priority
      : 'RELEVANTE';

    const safeKind: EventKind = (kind && ['EVENTO','TAREA','SOLICITUD'].includes(kind))
      ? kind
      : (shareLink ? 'SOLICITUD' : 'EVENTO'); // heurística para solicitudes

    const safeRepeat: RepeatRule = (repeat && ['NONE','DAILY','WEEKLY','MONTHLY','YEARLY'].includes(repeat))
      ? repeat
      : 'NONE';

    const safeWindow: AvailabilityWindow = (window && ['NONE','PRONTO','SEMANA','MES','RANGO'].includes(window))
      ? window
      : 'NONE';

    const safeIsInPerson: boolean = (typeof isInPerson === 'boolean') ? isInPerson : true;
    const safeCanOverlap: boolean = (typeof canOverlap === 'boolean') ? canOverlap : !safeIsInPerson;

    // Reglas Eisenhower

    // 1) CRITICA → requiere fecha y hora obligatoria
    if (safePriority === 'CRITICA') {
      if (!start || !end) {
        return NextResponse.json(
          { error: 'Para prioridad CRITICA, start y end son obligatorios.' },
          { status: 400 }
        );
      }
    }

    // 2) URGENTE/RELEVANTE → si no hay fecha/hora, usar ventana
    if ((safePriority === 'URGENTE' || safePriority === 'RELEVANTE') && (!start || !end)) {
      if (safeWindow === 'NONE') {
        // Por defecto, si no mandan ventana, interpretamos PRONTO
        // (o devuelve 400 si quieres obligar)
      }
      if (safeWindow === 'RANGO') {
        // si es RANGO, aseguramos windowStart/windowEnd
        if (!windowStart || !windowEnd) {
          return NextResponse.json(
            { error: 'Para ventana RANGO, windowStart y windowEnd son obligatorios.' },
            { status: 400 }
          );
        }
      }
    }

    // 3) OPCIONAL → se va a lista de espera (sin fechas)
    let finalStatus = status || 'SCHEDULED';
    let finalStart: Date | null = start ? new Date(start) : null;
    let finalEnd: Date | null = end ? new Date(end) : null;

    if (safePriority === 'OPCIONAL') {
      finalStatus = 'WAITLIST';
      finalStart = null;
      finalEnd = null;
    }

    // 4) SOLICITUD → por defecto status PENDING y requiere al menos una ventana
    if (safeKind === 'SOLICITUD' && (!start || !end)) {
      if (finalStatus === 'SCHEDULED') finalStatus = 'PENDING';
      if (safeWindow === 'NONE') {
        // fuerza ventana por defecto
        // si quieres, devuelve 400:
        // return NextResponse.json({ error: 'Solicitud requiere ventana de disponibilidad.' }, { status: 400 });
      }
    }

    // Asegura usuario demo
    let user = await prisma.user.findUnique({ where: { id: DEMO_USER } });
    if (!user) {
      user = await prisma.user.create({ data: { id: DEMO_USER, email: 'demo@example.com', name: 'Demo' } });
      await prisma.userPrefs.create({ data: { userId: user.id } }).catch(() => {});
    }

    const created = await prisma.event.create({
      data: {
        userId: user.id,
        kind: safeKind,
        title,
        description: description || null,
        start: finalStart,
        end: finalEnd,
        durationMinutes: finalStart && finalEnd ? Math.max(0, Math.round((finalEnd.getTime() - finalStart.getTime()) / 60000)) : null,
        priority: safePriority,
        category: category || null,
        isInPerson: safeIsInPerson,
        canOverlap: safeCanOverlap,
        repeat: safeRepeat,
        window: safeWindow,
        windowStart: windowStart ? new Date(windowStart) : null,
        windowEnd: windowEnd ? new Date(windowEnd) : null,
        shareLink: shareLink || null,
        status: finalStatus,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    console.error('Error al crear evento:', err);
    return NextResponse.json({ error: 'Error interno al crear evento' }, { status: 500 });
  }
}
