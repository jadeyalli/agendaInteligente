/**
 * Repositorio de configuración del usuario.
 * Encapsula las queries a UserSettings y AvailabilitySlot.
 */
import { prisma } from '@/lib/prisma';

import type { AvailabilitySlot, UserSettings } from '@prisma/client';

export class SettingsRepository {
  /**
   * Obtiene la configuración del usuario, o null si no existe.
   * @param userId - ID del usuario.
   */
  async findByUserId(userId: string): Promise<UserSettings | null> {
    return prisma.userSettings.findUnique({ where: { userId } });
  }

  /**
   * Obtiene todos los slots de disponibilidad del usuario.
   * @param userId - ID del usuario.
   */
  async findAvailabilitySlots(userId: string): Promise<AvailabilitySlot[]> {
    return prisma.availabilitySlot.findMany({ where: { userId } });
  }
}

export const settingsRepository = new SettingsRepository();
