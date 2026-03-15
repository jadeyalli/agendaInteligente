/**
 * Repositorio de eventos.
 * Encapsula todas las queries a la tabla Event de la base de datos.
 */
import { prisma } from '@/lib/prisma';

import type { Event } from '@prisma/client';

export class EventRepository {
  /**
   * Obtiene todos los eventos del usuario ordenados por start ASC.
   * @param userId - ID del usuario propietario.
   */
  async findByUserId(userId: string): Promise<Event[]> {
    return prisma.event.findMany({
      where: { userId },
      orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Obtiene todos los eventos activos (no completados) del usuario.
   * @param userId - ID del usuario propietario.
   */
  async findActiveByUserId(userId: string): Promise<Event[]> {
    return prisma.event.findMany({
      where: { userId, completed: false },
      orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Obtiene un subconjunto de eventos por sus IDs.
   * @param ids - Lista de IDs de eventos.
   */
  async findByIds(ids: string[]): Promise<Event[]> {
    if (ids.length === 0) return [];
    return prisma.event.findMany({ where: { id: { in: ids } } });
  }

  /**
   * Actualiza el start/end de un único evento tras el agendamiento.
   * @param eventId - ID del evento a actualizar.
   * @param start - Nueva fecha/hora de inicio.
   * @param end - Nueva fecha/hora de fin.
   */
  async updateSchedule(eventId: string, start: Date, end: Date): Promise<Event> {
    return prisma.event.update({
      where: { id: eventId },
      data: { start, end, status: 'SCHEDULED' },
    });
  }

  /**
   * Actualiza el start/end de múltiples eventos en una sola transacción.
   * @param updates - Lista de { id, start, end } a aplicar.
   */
  async batchUpdateSchedules(
    updates: Array<{ id: string; start: Date; end: Date }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    await prisma.$transaction(
      updates.map((u) =>
        prisma.event.update({
          where: { id: u.id },
          data: { start: u.start, end: u.end, status: 'SCHEDULED' },
        }),
      ),
    );
  }
}

export const eventRepository = new EventRepository();
