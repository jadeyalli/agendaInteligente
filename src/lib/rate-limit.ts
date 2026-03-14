/**
 * Rate limiter en memoria (in-process).
 * Apto para instancia única (dev/producción con un solo proceso).
 * Para múltiples instancias usar Redis.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

// Limpia entradas expiradas cada 5 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, 5 * 60_000).unref();

/**
 * Comprueba si la clave superó el límite.
 * @param key        Identificador (ej. "login:1.2.3.4")
 * @param limit      Número máximo de peticiones permitidas en la ventana
 * @param windowMs   Duración de la ventana en milisegundos
 * @returns          { allowed: boolean; remaining: number; resetAt: Date }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const allowed = bucket.count <= limit;

  return { allowed, remaining, resetAt: new Date(bucket.resetAt) };
}

/** Extrae la IP del cliente de la Request (compatible con Next.js edge y node). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
