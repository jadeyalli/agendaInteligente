// ========================================
// ARCHIVO: src/lib/timezone.ts
// Utilidades centralizadas para manejar zonas horarias
// ========================================

/**
 * Convierte un Date a ISO string en UTC
 * SIEMPRE guardar en UTC en la BD
 */


export function toUTCDate(date: Date | null | undefined): Date | null {
  if (!date) return null;
  // Asegurar que es un Date válido
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Convierte Date a string ISO para enviar al servidor
 */
export function dateToISO(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = toUTCDate(date);
  return d ? d.toISOString() : null;
}

/**
 * Convierte string ISO del servidor a Date
 */
export function isoToDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Convierte Date a string HH:mm para inputs type="time"
 * Usa UTC para consistencia
 */
export function dateToTimeString(date: Date | null | undefined): string {
  if (!date) return '';
  const d = toUTCDate(date);
  if (!d) return '';
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convierte Date a string YYYY-MM-DD para inputs type="date"
 * Usa UTC para consistencia
 */
export function dateToDateString(date: Date | null | undefined): string {
  if (!date) return '';
  const d = toUTCDate(date);
  if (!d) return '';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Crea un Date a partir de strings de date + time inputs (en UTC)
 */
export function dateAndTimeToDate(
  dateStr: string | undefined,
  timeStr: string | undefined
): Date | null {
  if (!dateStr) return null;

  const [year, month, day] = dateStr.split('-');
  const [hours = '00', minutes = '00'] = (timeStr || '').split(':');

  try {
    return new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes),
        0,
        0
      )
    );
  } catch {
    return null;
  }
}


/**
 * Obtiene la zona horaria del navegador
 */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Obtiene el offset UTC en milisegundos
 * Ejemplo: si estás en GMT-6, devuelve -6 horas en ms
 */
export function getUTCOffset(): number {
  const now = new Date();
  return now.getTimezoneOffset() * 60 * 1000;
}

/**
 * ✅ NUEVO: Convierte una hora UTC a hora LOCAL del navegador
 * Esto es lo que necesitabas
 */
export function utcToLocal(utcDate: Date | null | undefined): Date | null {
  if (!utcDate) return null;

  const d = new Date(utcDate);
  if (isNaN(d.getTime())) return null;

  // El Date de JavaScript guarda la hora UTC internamente
  // Pero cuando haces getHours(), getMinutes() obtiene hora LOCAL
  // Así que NO necesitamos transformar, solo mostrar con getHours()
  return d;
}

/**
 * ✅ NUEVO: Convierte Date a string HH:mm para inputs type="time"
 * MOSTRANDO LA HORA LOCAL (no UTC)
 */
export function dateToTimeStringLocal(date: Date | null | undefined): string {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  // ✅ CAMBIO: Usar getHours() en lugar de getUTCHours()
  // getHours() devuelve la hora LOCAL del navegador
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * ✅ NUEVO: Convierte Date a string YYYY-MM-DD para inputs type="date"
 * MOSTRANDO LA FECHA LOCAL (no UTC)
 */
export function dateToDateStringLocal(date: Date | null | undefined): string {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  // ✅ CAMBIO: Usar getDate(), getMonth(), getFullYear() (locales)
  // en lugar de getUTCDate(), getUTCMonth(), getUTCFullYear()
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * ✅ NUEVO: Crea Date a partir de inputs DE HORA LOCAL
 * Esto es lo contrario: el usuario escribe 9:00 AM
 * Debemos guardar como UTC (si está en GMT-6, 9:00 AM local = 15:00 UTC)
 */
export function dateAndTimeToDateLocal(
  dateStr: string | undefined,
  timeStr: string | undefined
): Date | null {
  if (!dateStr) return null;

  const [year, month, day] = dateStr.split('-');
  const [hours = '00', minutes = '00'] = (timeStr || '').split(':');

  try {
    // Crear Date en ZONA LOCAL
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      0,
      0
    );

    // JavaScript lo almacena internamente en UTC
    // Así que cuando lo guardamos, es UTC correcto
    return date;
  } catch {
    return null;
  }
}

/**
 * Debug completo
 */
export function debugDateFull(label: string, date: Date | null | undefined) {
  if (!date) {
    console.log(`[${label}] → null/undefined`);
    return;
  }

  const d = new Date(date);
  const tz = getBrowserTimezone();
  
  console.log(`[${label}] - Zona: ${tz}`, {
    isoString: d.toISOString(),
    
    // UTC (lo que se guarda en BD)
    utcHours: d.getUTCHours(),
    utcMinutes: d.getUTCMinutes(),
    utcDate: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    
    // LOCAL (lo que ve el usuario)
    localHours: d.getHours(),
    localMinutes: d.getMinutes(),
    localDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    
    // Strings para inputs
    timeStringLocal: dateToTimeStringLocal(d),
    dateStringLocal: dateToDateStringLocal(d),
  });
}