/**
 * Constantes globales del sistema Agenda Inteligente.
 * Todos los límites operativos definidos en el Documento Técnico v3 §3.
 */

/** Granularidad temporal del solver en minutos. */
export const SLOT_MINUTES = 5;

/** Máximo de eventos flexibles (urgentes + relevantes) que entran al solver. §3.2 */
export const MAX_FLEXIBLE_EVENTS = 60;

/** Máximo de candidatos evaluados por evento. §3.2 */
export const MAX_CANDIDATES_PER_EVENT = 150;

/** Timeout del solver en segundos. §3.3 */
export const SOLVER_TIMEOUT_SECONDS = 5.0;

/** Gap de optimalidad: se detiene cuando la solución está dentro del 5% del óptimo. §3.3 */
export const SOLVER_GAP_LIMIT = 0.05;

/** Ventana de planificación máxima en días. §3.1 */
export const MAX_WINDOW_DAYS = 30;

/** Máximo de ejecuciones del solver por minuto por usuario (ventana deslizante). §3.4 */
export const SOLVER_RATE_LIMIT_PER_MINUTE = 3;

/** Máximo de ejecuciones concurrentes del solver en el servidor. §3.4 */
export const MAX_CONCURRENT_SOLVERS = 5;

/** Timeout del proceso Python en milisegundos (margen holgado sobre los 5 s del solver). */
export const SOLVER_PROCESS_TIMEOUT_MS = 30_000;

/** Pesos por prioridad de evento en la función objetivo. §4.4 */
export const PRIORITY_WEIGHTS: Record<string, number> = {
  UnI: 3,
  InU: 1,
};

/** Horas antes del fin de ventana para emitir una alerta. §5.1 */
export const WINDOW_ALERT_HOURS = 24;
