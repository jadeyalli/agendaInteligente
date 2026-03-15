/**
 * Servicio que aplica los resultados del solver a la base de datos.
 * Responsabilidad única: SolverOutput → operaciones de BD.
 */
import { eventRepository } from '@/repositories/events.repo';

import type { SolverOutput } from '@/domain/types';

export class ResultApplier {
  /**
   * Aplica los cambios aprobados por el usuario a la base de datos.
   * Combina los eventos "placed" y "moved" en un único lote de actualizaciones.
   *
   * Precondición: el usuario ya aprobó los cambios en el frontend (transparencia §5.3).
   *
   * @param solverOutput - Respuesta validada del solver Python.
   */
  async apply(solverOutput: SolverOutput): Promise<void> {
    // Construir mapa id → { start, end } de los eventos placed (tienen start y end exactos)
    const placedMap = new Map<string, { start: Date; end: Date }>();
    for (const p of solverOutput.placed) {
      placedMap.set(p.id, {
        start: new Date(p.start),
        end: new Date(p.end),
      });
    }

    // Para los eventos moved, necesitamos calcular el end a partir de la duración original.
    // Obtenemos los eventos de la BD para recuperar su duración.
    const movedIds = solverOutput.moved
      .map((m) => m.id)
      .filter((id) => !placedMap.has(id));

    const movedDbEvents = await eventRepository.findByIds(movedIds);
    const durationMap = new Map<string, number>();
    for (const e of movedDbEvents) {
      const durationMs = e.durationMinutes
        ? e.durationMinutes * 60_000
        : e.start && e.end
          ? new Date(e.end).getTime() - new Date(e.start).getTime()
          : 30 * 60_000; // 30 min por defecto
      durationMap.set(e.id, durationMs);
    }

    // Agregar eventos moved al mapa (si no aparecen en placed ya)
    for (const m of solverOutput.moved) {
      if (!placedMap.has(m.id)) {
        const start = new Date(m.toStart);
        const durationMs = durationMap.get(m.id) ?? 30 * 60_000;
        const end = new Date(start.getTime() + durationMs);
        placedMap.set(m.id, { start, end });
      }
    }

    const updates = Array.from(placedMap.entries()).map(([id, { start, end }]) => ({
      id,
      start,
      end,
    }));

    await eventRepository.batchUpdateSchedules(updates);
  }
}
