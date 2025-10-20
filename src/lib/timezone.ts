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

type ParsedTime = { hours: number; minutes: number };

function isValidTime({ hours, minutes }: ParsedTime): boolean {
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function buildParsedTime(hours: number, minutes: number): ParsedTime | null {
  const normalized = { hours, minutes };
  return isValidTime(normalized) ? normalized : null;
}

function parseAmPmToken(token: string): 'AM' | 'PM' | null {
  const normalized = token.replace(/\./g, '').toUpperCase();
  if (normalized === 'AM') return 'AM';
  if (normalized === 'PM') return 'PM';
  return null;
}

export function parseTimeLike(value: string | number | null | undefined): ParsedTime | null {
  if (value == null) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const hours = Math.trunc(value);
    const minutes = Math.round((value - hours) * 60);
    return buildParsedTime(hours, minutes);
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();

  const ampmMatch = normalized.match(/^([0-9]{1,2})(?:[:h\.]?([0-9]{1,2}))?\s*(a\.?m\.?|p\.?m\.?)$/);
  if (ampmMatch) {
    const hoursRaw = Number(ampmMatch[1]);
    const minutesRaw = ampmMatch[2] != null ? Number(ampmMatch[2]) : 0;
    if (!Number.isFinite(hoursRaw) || !Number.isFinite(minutesRaw)) return null;

    const meridian = parseAmPmToken(ampmMatch[3]);
    if (!meridian) return null;

    let hours = hoursRaw % 12;
    if (meridian === 'PM') hours = (hours + 12) % 24;
    return buildParsedTime(hours, minutesRaw);
  }

  const digitsOnly = normalized.match(/^([0-9]{1,2})([0-9]{2})$/);
  if (digitsOnly) {
    const hours = Number(digitsOnly[1]);
    const minutes = Number(digitsOnly[2]);
    return buildParsedTime(hours, minutes);
  }

  const generic = normalized.match(/^([0-9]{1,2})(?:[:h\.\s]?([0-9]{1,2}))?$/);
  if (generic) {
    const hours = Number(generic[1]);
    const minutes = generic[2] != null ? Number(generic[2]) : 0;
    return buildParsedTime(hours, minutes);
  }

  return null;
}

type ParsedDate = { year: number; month: number; day: number };

function isValidDateParts({ year, month, day }: ParsedDate): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

export function parseDateLike(value: string | Date | null | undefined): ParsedDate | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/[^0-9]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [a, b, c] = parts.map((segment) => Number(segment));
  if (parts[0].length === 4) {
    const parsed = { year: a, month: b, day: c };
    return isValidDateParts(parsed) ? parsed : null;
  }

  if (parts[2].length === 4) {
    let day = a;
    let month = b;
    const year = c;

    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    } else if (a > 12 && b <= 12) {
      day = a;
      month = b;
    }

    const parsed = { year, month, day };
    return isValidDateParts(parsed) ? parsed : null;
  }

  return null;
}

type BuildDateOptions = { fallbackTime?: string | number | null };

export function buildUTCDateFromStrings(
  dateValue: string | Date | null | undefined,
  timeValue?: string | number | null,
  options: BuildDateOptions = {}
): Date | null {
  const dateParts = parseDateLike(dateValue);
  if (!dateParts) return null;

  let timeParts = parseTimeLike(timeValue ?? null);
  if (!timeParts && options.fallbackTime != null) {
    timeParts = parseTimeLike(options.fallbackTime);
  }

  if (!timeParts) {
    timeParts = { hours: 0, minutes: 0 };
  }

  const { year, month, day } = dateParts;
  const { hours, minutes } = timeParts;

  const result = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  return isNaN(result.getTime()) ? null : result;
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