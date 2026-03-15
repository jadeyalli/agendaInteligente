/**
 * Servicio orquestador del agendamiento inteligente.
 * Coordina: payload-builder → solver-runner → validación → result-applier.
 */
import { SolverOutputSchema, type ValidatedSolverOutput } from '@/domain/solver-contract';
import { buildSolverPayload } from '@/services/payload-builder';
import { ResultApplier } from '@/services/result-applier';
import { runSolverProcess } from '@/services/solver-runner';

import type { SolverFlexibleEvent } from '@/domain/types';

export class SchedulingService {
  private readonly resultApplier = new ResultApplier();

  /**
   * Ejecuta el solver para un usuario y retorna el resultado validado.
   * NO aplica los cambios automáticamente — el frontend debe confirmar (§5.3).
   *
   * @param userId - ID del usuario para quien se optimiza la agenda.
   * @param newEvents - Eventos nuevos que aún no están en la BD.
   * @returns Resultado validado del solver listo para mostrar al usuario.
   * @throws Error si el solver falla o la respuesta tiene formato inesperado.
   */
  async solve(
    userId: string,
    newEvents: SolverFlexibleEvent[] = [],
  ): Promise<ValidatedSolverOutput> {
    const payload = await buildSolverPayload(userId, newEvents);
    const raw = await runSolverProcess(payload);

    const parsed = SolverOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Respuesta del solver con formato inesperado.');
    }

    return parsed.data;
  }

  /**
   * Aplica los cambios aprobados por el usuario a la base de datos.
   * Debe llamarse solo después de que el usuario confirmó los reagendamientos.
   *
   * @param solverOutput - Salida validada del solver previamente ejecutado.
   */
  async applyApprovedChanges(solverOutput: ValidatedSolverOutput): Promise<void> {
    await this.resultApplier.apply(solverOutput);
  }
}
