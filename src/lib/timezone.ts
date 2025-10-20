const DEFAULT_FALLBACK_TIMEZONE = 'UTC';

function isValidDateInput(value?: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isValidTimeInput(value?: string | null): value is string {
  return !!value && /^\d{2}:\d{2}$/.test(value.trim());
}

function normalizeTimezone(timeZone?: string | null): string {
  const trimmed = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!trimmed) return DEFAULT_FALLBACK_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date(0));
    return trimmed;
  } catch {
    return DEFAULT_FALLBACK_TIMEZONE;
  }
}

function getTimezoneOffset(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = dtf.formatToParts(date);
    const data = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    } as Record<string, number>;

    for (const part of parts) {
      if (part.type === 'literal') continue;
      const num = Number(part.value);
      if (Number.isFinite(num)) {
        data[part.type] = num;
      }
    }

    const asUTC = Date.UTC(
      data.year,
      (data.month ?? 1) - 1,
      data.day ?? 1,
      data.hour ?? 0,
      data.minute ?? 0,
      data.second ?? 0,
    );
    return asUTC - date.getTime();
  } catch {
    return 0;
  }
}

export function resolveBrowserTimezone(): string {
  try {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat === 'undefined') {
      return DEFAULT_FALLBACK_TIMEZONE;
    }
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimezone(resolved);
  } catch {
    return DEFAULT_FALLBACK_TIMEZONE;
  }
}

export function dateAndTimeToDateLocal(
  date?: string | null,
  time?: string | null,
  timeZone?: string | null,
): Date | null {
  if (!isValidDateInput(date)) return null;

  const tz = normalizeTimezone(timeZone);
  const [year, month, day] = date.split('-').map(Number);
  let hours = 0;
  let minutes = 0;

  if (isValidTimeInput(time)) {
    const [h, m] = (time as string).split(':').map(Number);
    hours = Number.isFinite(h) ? h : 0;
    minutes = Number.isFinite(m) ? m : 0;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  if (tz === 'UTC') return candidate;

  const offset = getTimezoneOffset(candidate, tz);
  return new Date(candidate.getTime() - offset);
}

export function dateStringToStartOfDay(
  date?: string | null,
  timeZone?: string | null,
): Date | null {
  return dateAndTimeToDateLocal(date, '00:00', timeZone);
}

export function dateStringToEndOfDay(
  date?: string | null,
  timeZone?: string | null,
): Date | null {
  const base = dateAndTimeToDateLocal(date, '23:59', timeZone);
  if (!base) return null;
  return new Date(base.getTime() + 59 * 1000 + 999);
}

export function isoToDate(value?: string | null): Date | null {
  if (!value) return null;
  const candidate = new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function formatParts(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
  const out: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type === 'literal') continue;
    out[part.type] = part.value;
  }
  return out;
}

export function dateToDateStringLocal(date?: Date | null, timeZone?: string | null): string {
  if (!date) return '';
  const tz = normalizeTimezone(timeZone);
  try {
    const parts = formatParts(date, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const year = parts.year ?? String(date.getUTCFullYear());
    const month = parts.month ?? String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = parts.day ?? String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function dateToTimeStringLocal(date?: Date | null, timeZone?: string | null): string {
  if (!date) return '';
  const tz = normalizeTimezone(timeZone);
  try {
    const parts = formatParts(date, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const hour = parts.hour ?? String(date.getUTCHours()).padStart(2, '0');
    const minute = parts.minute ?? String(date.getUTCMinutes()).padStart(2, '0');
    return `${hour}:${minute}`;
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function debugDateFull(date?: Date | null, timeZone?: string | null): string {
  if (!date) return '—';
  const tz = normalizeTimezone(timeZone);
  const iso = date.toISOString();
  try {
    const formatted = new Intl.DateTimeFormat('es-MX', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return `${iso} [${tz} ${formatted}]`;
  } catch {
    return `${iso} [${tz}]`;
  }
}

export type TimezoneHelpers = {
  resolveBrowserTimezone: typeof resolveBrowserTimezone;
  dateAndTimeToDateLocal: typeof dateAndTimeToDateLocal;
  dateStringToStartOfDay: typeof dateStringToStartOfDay;
  dateStringToEndOfDay: typeof dateStringToEndOfDay;
  dateToDateStringLocal: typeof dateToDateStringLocal;
  dateToTimeStringLocal: typeof dateToTimeStringLocal;
  isoToDate: typeof isoToDate;
  debugDateFull: typeof debugDateFull;
};

export const timezoneHelpers: TimezoneHelpers = {
  resolveBrowserTimezone,
  dateAndTimeToDateLocal,
  dateStringToStartOfDay,
  dateStringToEndOfDay,
  dateToDateStringLocal,
  dateToTimeStringLocal,
  isoToDate,
  debugDateFull,
};
