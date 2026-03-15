/**
 * Ejecuta el proceso Python del solver como subproceso.
 * Responsabilidad única: serializar payload → stdout → deserializar JSON.
 */
import { spawn } from 'child_process';

import { SOLVER_PROCESS_TIMEOUT_MS } from '@/domain/constants';

import type { SolverPayload } from '@/domain/types';

/**
 * Invoca el solver Python (`python -m solver`) pasando el payload por stdin
 * y retorna la salida parseada como objeto JSON.
 *
 * @param payload - Payload completo a enviar al solver.
 * @returns Objeto JSON crudo sin validar (la validación es responsabilidad del llamante).
 * @throws Error si el proceso falla, timeout o la salida no es JSON válido.
 */
export async function runSolverProcess(payload: SolverPayload): Promise<unknown> {
  const pythonBin = process.env.PYTHON_BIN ?? 'python';

  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(pythonBin, ['-m', 'solver'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`El solver tardó demasiado (timeout ${SOLVER_PROCESS_TIMEOUT_MS / 1000} s).`));
    }, SOLVER_PROCESS_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

    child.on('error', (err) =>
      finish(() => reject(new Error('No se pudo ejecutar Python: ' + err.message))),
    );

    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(`Solver salió con código ${code}\n${stderr || stdout}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error('No se pudo parsear salida del solver: ' + msg + '\n' + stdout));
        }
      });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
