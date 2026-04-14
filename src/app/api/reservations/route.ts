import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/session';
import { reservationsRepository } from '@/repositories/reservations.repo';

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
}

/** GET /api/reservations — todas las reservaciones del usuario */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const recurringOnly = searchParams.get('recurring') === 'true';

    const reservations = recurringOnly
      ? await reservationsRepository.findRecurringByUserId(user.id)
      : await reservationsRepository.findByUserId(user.id);

    return NextResponse.json({ reservations });
  } catch (e) {
    console.error('GET /api/reservations error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const CreateReservationSchema = z.discriminatedUnion('isRecurring', [
  // Reservación recurrente
  z.object({
    isRecurring: z.literal(true),
    title: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  }),
  // Reservación puntual
  z.object({
    isRecurring: z.literal(false),
    title: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
]);

/** POST /api/reservations — crear una reservación */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateReservationSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    if (data.isRecurring) {
      const reservation = await reservationsRepository.create({
        userId: user.id,
        title: data.title,
        description: data.description,
        isRecurring: true,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
      });
      return NextResponse.json(reservation, { status: 201 });
    } else {
      if (data.end <= data.start) {
        return NextResponse.json(
          { error: 'La hora de fin debe ser posterior a la hora de inicio.' },
          { status: 400 },
        );
      }
      const reservation = await reservationsRepository.create({
        userId: user.id,
        title: data.title,
        description: data.description,
        isRecurring: false,
        start: data.start,
        end: data.end,
      });
      return NextResponse.json(reservation, { status: 201 });
    }
  } catch (e) {
    console.error('POST /api/reservations error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
