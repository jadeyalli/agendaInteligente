/**
 * Repositorio de eventos.
 * Encapsula todas las queries a la tabla Event de la base de datos.
 */
import { prisma } from '@/lib/prisma';

import type { Event, Priority } from '@prisma/client';

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

  /**
   * Crea un evento nuevo en la agenda de un usuario.
   * Usado por el módulo colaborativo al confirmar o aceptar un horario.
   */
  async create(data: {
    userId: string;
    title: string;
    description?: string | null;
    priority: string;
    start: Date;
    end: Date;
    isFixed?: boolean;
    canOverlap?: boolean;
    durationMinutes: number;
  }): Promise<Event> {
    return prisma.event.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description,
        priority: data.priority as Priority,
        start: data.start,
        end: data.end,
        isFixed: data.isFixed ?? false,
        canOverlap: data.canOverlap ?? false,
        durationMinutes: data.durationMinutes,
        status: 'SCHEDULED',
      },
    });
  }

  /**
   * Convierte un evento en recordatorio (para cancelaciones colaborativas).
   * Elimina isFixed y establece canOverlap = true para que se solape sin afectar agenda.
   */
  async convertToReminder(eventId: string): Promise<void> {
    await prisma.event.update({
      where: { id: eventId },
      data: { priority: 'RECORDATORIO', isFixed: false, canOverlap: true },
    });
  }

  /**
   * Actualiza el campo isFixed de un evento.
   * Usado al aprobar reagendamiento colaborativo para desfijir temporalmente.
   */
  async updateFixed(eventId: string, isFixed: boolean): Promise<void> {
    await prisma.event.update({
      where: { id: eventId },
      data: { isFixed },
    });
  }

  /**
   * Elimina un evento por ID.
   * Usado cuando un invitado sale de un evento colaborativo que ya había aceptado.
   */
  async delete(eventId: string): Promise<void> {
    await prisma.event.delete({ where: { id: eventId } });
  }
}

export const eventRepository = new EventRepository();
