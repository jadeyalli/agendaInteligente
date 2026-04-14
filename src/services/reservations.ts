/**
 * Servicio de reservaciones: expande las reservaciones recurrentes a
 * instancias concretas { start, end } dentro de un horizonte dado.
 * Las reservaciones puntuales se incluyen directamente si caen en el rango.
 */
import type { Reservation } from '@prisma/client';

export interface ReservationInstance {
  id: string;          // "{reservationId}_YYYY-MM-DD" para recurrentes, id original para puntuales
  reservationId: string;
  title: string | null;
  start: Date;
  end: Date;
}

/**
 * Parsea "HH:MM" → { hour, minute }.
 */
function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/**
 * Expande las reservaciones del usuario a instancias concretas dentro de [from, to].
 *
 * - Recurrentes: genera una instancia por cada ocurrencia del dayOfWeek dentro del horizonte.
 * - Puntuales: incluye las que tienen start >= from y end <= to.
 */
export function expandReservations(
  reservations: Reservation[],
  from: Date,
  to: Date,
): ReservationInstance[] {
  const instances: ReservationInstance[] = [];

  for (const r of reservations) {
    if (r.isRecurring) {
      if (r.dayOfWeek == null || !r.startTime || !r.endTime) continue;

      const startParts = parseTime(r.startTime);
      const endParts = parseTime(r.endTime);

      // Itera día a día dentro del horizonte
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);

      while (cursor <= to) {
        if (cursor.getDay() === r.dayOfWeek) {
          const start = new Date(cursor);
          start.setHours(startParts.hour, startParts.minute, 0, 0);

          const end = new Date(cursor);
          end.setHours(endParts.hour, endParts.minute, 0, 0);

          // Si endTime <= startTime asumimos que cruza medianoche
          if (end <= start) {
            end.setDate(end.getDate() + 1);
          }

          if (start >= from && end <= to) {
            const dateKey = cursor.toISOString().slice(0, 10);
            instances.push({
              id: `${r.id}_${dateKey}`,
              reservationId: r.id,
              title: r.title,
              start,
              end,
            });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // Puntual
      if (!r.start || !r.end) continue;
      const start = new Date(r.start);
      const end = new Date(r.end);
      if (start >= from && end <= to) {
        instances.push({
          id: r.id,
          reservationId: r.id,
          title: r.title,
          start,
          end,
        });
      }
    }
  }

  return instances;
}
