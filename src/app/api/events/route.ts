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

    const {
      title,
      description,
      priority,
      category,
      isInPerson,
      canOverlap,
      start,
      end,
      repeat,
      window,
      windowStart,
      windowEnd,
      kind,
      status,
      shareLink,
    } = body || {};

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title es obligatorio' }, { status: 400 });
    }

    const safePriority: Priority = (priority && ['CRITICA','URGENTE','RELEVANTE','OPCIONAL'].includes(priority))
      ? priority
      : 'RELEVANTE';

    const safeKind: EventKind = (kind && ['EVENTO','TAREA','SOLICITUD'].includes(kind))
      ? kind
      : (shareLink ? 'SOLICITUD' : 'EVENTO');

    const safeRepeat: RepeatRule = (repeat && ['NONE','DAILY','WEEKLY','MONTHLY','YEARLY'].includes(repeat))
      ? repeat
      : 'NONE';

    const safeWindow: AvailabilityWindow = (window && ['NONE','PRONTO','SEMANA','MES','RANGO'].includes(window))
      ? window
      : 'NONE';

    const safeIsInPerson: boolean = (typeof isInPerson === 'boolean') ? isInPerson : true;
    const safeCanOverlap: boolean = (typeof canOverlap === 'boolean') ? canOverlap : !safeIsInPerson;


    if (safePriority === 'CRITICA') {
      if (!start || !end) {
        return NextResponse.json(
          { error: 'Para prioridad CRITICA, start y end son obligatorios.' },
          { status: 400 }
        );
      }
    }

    if ((safePriority === 'URGENTE' || safePriority === 'RELEVANTE') && (!start || !end)) {
      if (safeWindow === 'NONE') {
      }
      if (safeWindow === 'RANGO') {
        if (!windowStart || !windowEnd) {
          return NextResponse.json(
            { error: 'Para ventana RANGO, windowStart y windowEnd son obligatorios.' },
            { status: 400 }
          );
        }
      }
    }

    let finalStatus = status || 'SCHEDULED';
    let finalStart: Date | null = start ? new Date(start) : null;
    let finalEnd: Date | null = end ? new Date(end) : null;

    if (safePriority === 'OPCIONAL') {
      finalStatus = 'WAITLIST';
      finalStart = null;
      finalEnd = null;
    }

    if (safeKind === 'SOLICITUD' && (!start || !end)) {
      if (finalStatus === 'SCHEDULED') finalStatus = 'PENDING';
      if (safeWindow === 'NONE') {
      }
    }

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
