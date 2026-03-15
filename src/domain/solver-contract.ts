/**
 * Schemas Zod para validar la entrada y salida del solver Python.
 * Actúa como contrato formal entre el servicio TypeScript y el proceso Python.
 */
import { z } from 'zod';

export const SolverOutputSchema = z.object({
  placed: z.array(
    z.object({
      id: z.string(),
      start: z.string(),
      end: z.string(),
    }),
  ),
  moved: z.array(
    z.object({
      id: z.string(),
      fromStart: z.string().nullable(),
      toStart: z.string(),
      reason: z.string(),
    }),
  ),
  unplaced: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
    }),
  ),
  score: z.number().nullable(),
  diagnostics: z.object({
    hardConflicts: z.array(z.string()),
    summary: z.string(),
  }),
});

export type ValidatedSolverOutput = z.infer<typeof SolverOutputSchema>;
