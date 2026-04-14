import { prisma } from '@/lib/prisma';
import type { Reservation } from '@prisma/client';

export const reservationsRepository = {
  /** Todas las reservaciones del usuario (puntuales + recurrentes). */
  findByUserId(userId: string): Promise<Reservation[]> {
    return prisma.reservation.findMany({ where: { userId } });
  },

  /** Solo las recurrentes (para mostrar en Settings). */
  findRecurringByUserId(userId: string): Promise<Reservation[]> {
    return prisma.reservation.findMany({
      where: { userId, isRecurring: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  },

  /** Reservaciones puntuales dentro de un rango de fechas. */
  findOneTimeInRange(userId: string, from: Date, to: Date): Promise<Reservation[]> {
    return prisma.reservation.findMany({
      where: {
        userId,
        isRecurring: false,
        start: { gte: from },
        end: { lte: to },
      },
    });
  },

  create(data: {
    userId: string;
    title?: string;
    description?: string;
    // puntual
    start?: Date;
    end?: Date;
    // recurrente
    isRecurring?: boolean;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
  }): Promise<Reservation> {
    return prisma.reservation.create({ data });
  },

  delete(id: string, userId: string): Promise<Reservation> {
    return prisma.reservation.delete({ where: { id, userId } });
  },

  findById(id: string): Promise<Reservation | null> {
    return prisma.reservation.findUnique({ where: { id } });
  },
};
