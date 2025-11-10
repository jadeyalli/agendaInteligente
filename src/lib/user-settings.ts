export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface UserSettingsValues {
  dayStart: string;
  dayEnd: string;
  enabledDays: DayCode[];
  eventBufferMinutes: number;
  schedulingLeadMinutes: number;
}

export const DAY_CODES: DayCode[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const JS_DAY_TO_DAY_CODE: DayCode[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DAY_LABELS: Record<DayCode, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
};

export const DAY_CODE_TO_WEEKDAY_INDEX: Record<DayCode, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

export const DEFAULT_USER_SETTINGS: UserSettingsValues = {
  dayStart: '09:00',
  dayEnd: '18:00',
  enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  eventBufferMinutes: 0,
  schedulingLeadMinutes: 0,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function sanitizeTimeString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(TIME_RE);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  return fallback;
}

export function sanitizePositiveInteger(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(num) && num >= 0) {
    return Math.round(num);
  }
  return fallback;
}

export function sanitizeDayCodes(value: unknown, fallback: DayCode[]): DayCode[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const set = new Set<DayCode>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const lower = item.toLowerCase() as DayCode;
    if ((DAY_CODES as string[]).includes(lower) && !set.has(lower)) {
      set.add(lower);
    }
  }
  if (set.size === 0) {
    return fallback;
  }
  return DAY_CODES.filter((code) => set.has(code));
}

export function parseEnabledDaysField(value: unknown): DayCode[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return sanitizeDayCodes(parsed, DEFAULT_USER_SETTINGS.enabledDays);
    } catch {
      return DEFAULT_USER_SETTINGS.enabledDays;
    }
  }
  if (Array.isArray(value)) {
    return sanitizeDayCodes(value, DEFAULT_USER_SETTINGS.enabledDays);
  }
  return DEFAULT_USER_SETTINGS.enabledDays;
}

export function serializeEnabledDays(days: DayCode[]): string {
  const ordered = DAY_CODES.filter((code) => days.includes(code));
  return JSON.stringify(ordered);
}

export function mergeUserSettings(partial?: Partial<UserSettingsValues> | null): UserSettingsValues {
  if (!partial) {
    return { ...DEFAULT_USER_SETTINGS };
  }
  return {
    dayStart: sanitizeTimeString(partial.dayStart, DEFAULT_USER_SETTINGS.dayStart),
    dayEnd: sanitizeTimeString(partial.dayEnd, DEFAULT_USER_SETTINGS.dayEnd),
    enabledDays: sanitizeDayCodes(partial.enabledDays, DEFAULT_USER_SETTINGS.enabledDays),
    eventBufferMinutes: sanitizePositiveInteger(
      partial.eventBufferMinutes,
      DEFAULT_USER_SETTINGS.eventBufferMinutes,
    ),
    schedulingLeadMinutes: sanitizePositiveInteger(
      partial.schedulingLeadMinutes,
      DEFAULT_USER_SETTINGS.schedulingLeadMinutes,
    ),
  };
}

export function timeStringToParts(value: string): { hour: number; minute: number } {
  const match = value.match(TIME_RE);
  if (!match) {
    return { hour: 0, minute: 0 };
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function hhmmToFullCalendar(value: string): string {
  const { hour, minute } = timeStringToParts(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hour)}:${pad(minute)}:00`;
}

export function dayCodesToWeekdayIndexes(days: DayCode[]): number[] {
  return days.map((code) => DAY_CODE_TO_WEEKDAY_INDEX[code]).filter((n) => typeof n === 'number');
}
