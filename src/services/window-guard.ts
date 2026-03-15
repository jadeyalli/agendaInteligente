/**
 * Servicio que detecta eventos cuyas ventanas de disponibilidad están por vencer.
 * Implementa la regla §5.1: si window_end(e) - now < 24 h → notificar.
 */
import { WINDOW_ALERT_HOURS } from '@/domain/constants';
import { eventRepository } from '@/repositories/events.repo';

import { Priority } from '@prisma/client';

/** Acciones que el usuario puede tomar ante una alerta de ventana. */
export type WindowAlertAction =
  | 'schedule_manually'
  | 'pin_event'
  | 'delete'
  | 'cancel';

/** Alerta emitida cuando la ventana de un evento está próxima a vencer. */
export interface WindowAlert {
  eventId: string;
  eventTitle: string;
  windowEnd: Date;
  hoursRemaining: number;
  suggestedActions: WindowAlertAction[];
}

/** Prioridades que participan en el solver y pueden tener ventana. */
const FLEXIBLE_PRIORITIES: Priority[] = ['URGENTE', 'RELEVANTE'];

export class WindowGuardService {
  /**
   * Revisa todos los eventos flexibles activos del usuario y retorna alertas
   * para los que tienen windowEnd a menos de WINDOW_ALERT_HOURS horas.
   *
   * @param userId - ID del usuario a verificar.
   * @returns Lista de alertas ordenadas por horasRestantes ASC (más urgentes primero).
   */
  async checkWindowAlerts(userId: string): Promise<WindowAlert[]> {
    const events = await eventRepository.findActiveByUserId(userId);
    const now = new Date();
    const thresholdMs = WINDOW_ALERT_HOURS * 60 * 60 * 1000;
    const alerts: WindowAlert[] = [];

    for (const e of events) {
      if (!FLEXIBLE_PRIORITIES.includes(e.priority)) continue;
      if (!e.windowEnd) continue;
      if (e.isFixed) continue; // Los fijados ya tienen slot asignado.

      const windowEnd = new Date(e.windowEnd);
      const msRemaining = windowEnd.getTime() - now.getTime();

      if (msRemaining > 0 && msRemaining < thresholdMs) {
        const hoursRemaining = Math.round(msRemaining / (60 * 60 * 1000));
        alerts.push({
          eventId: e.id,
          eventTitle: e.title,
          windowEnd,
          hoursRemaining,
          suggestedActions: ['schedule_manually', 'pin_event', 'delete', 'cancel'],
        });
      }
    }

    return alerts.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
  }
}
