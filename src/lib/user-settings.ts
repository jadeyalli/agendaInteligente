export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface UserSettingsValues {
  dayStart: string;
  dayEnd: string;
  enabledDays: DayCode[];
  eventBufferMinutes: number;
  schedulingLeadMinutes: number;
  timezone: string;
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

// JS day convention: 0=Sun, 1=Mon, ..., 6=Sat (matches AvailabilitySlot.dayOfWeek)
export const DAY_CODE_TO_JS_DAY: Record<DayCode, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export const DEFAULT_USER_SETTINGS: UserSettingsValues = {
  dayStart: '09:00',
  dayEnd: '18:00',
  enabledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  eventBufferMinutes: 0,
  schedulingLeadMinutes: 0,
  timezone: 'America/Mexico_City',
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

export function sanitizeBufferMinutes(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num) || num < 0) return fallback;
  const rounded = Math.round(num);
  if (rounded === 0) return 0;
  return Math.round(rounded / 5) * 5;
}

export function sanitizeTimezone(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date(0));
    return value.trim();
  } catch {
    return fallback;
  }
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
    eventBufferMinutes: sanitizeBufferMinutes(
      partial.eventBufferMinutes,
      DEFAULT_USER_SETTINGS.eventBufferMinutes,
    ),
    schedulingLeadMinutes: sanitizeBufferMinutes(
      partial.schedulingLeadMinutes,
      DEFAULT_USER_SETTINGS.schedulingLeadMinutes,
    ),
    timezone: sanitizeTimezone(partial.timezone, DEFAULT_USER_SETTINGS.timezone),
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

// ———————————— Availability slots per day ————————————

export type AvailabilitySlotInput = {
  dayOfWeek: number;   // JS convention: 0=Sun ... 6=Sat
  startTime: string;   // "HH:mm"
  endTime: string;     // "HH:mm"
};

export function sanitizeAvailabilitySlots(
  slots: unknown,
  enabledDays: DayCode[],
): AvailabilitySlotInput[] {
  if (!Array.isArray(slots)) return [];

  const enabledJsDays = new Set(enabledDays.map((code) => DAY_CODE_TO_JS_DAY[code]));
  const seen = new Set<number>();
  const result: AvailabilitySlotInput[] = [];

  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') continue;
    const s = slot as Record<string, unknown>;

    const dayOfWeek = typeof s.dayOfWeek === 'number' ? s.dayOfWeek : NaN;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
    if (!enabledJsDays.has(dayOfWeek)) continue;
    if (seen.has(dayOfWeek)) continue;

    const startTime = sanitizeTimeString(s.startTime, '');
    const endTime = sanitizeTimeString(s.endTime, '');
    if (!startTime || !endTime || endTime <= startTime) continue;

    seen.add(dayOfWeek);
    result.push({ dayOfWeek, startTime, endTime });
  }

  return result;
}

// ———————————— Timezone groups for UI ————————————

export type TimezoneGroup = { label: string; zones: { value: string; label: string }[] };

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: 'Américas',
    zones: [
      { value: 'America/Mexico_City', label: 'Ciudad de México (CST)' },
      { value: 'America/Monterrey', label: 'Monterrey (CST)' },
      { value: 'America/Tijuana', label: 'Tijuana (PST)' },
      { value: 'America/Bogota', label: 'Bogotá (COT)' },
      { value: 'America/Lima', label: 'Lima (PET)' },
      { value: 'America/Santiago', label: 'Santiago (CLT)' },
      { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
      { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)' },
      { value: 'America/New_York', label: 'Nueva York (EST)' },
      { value: 'America/Chicago', label: 'Chicago (CST)' },
      { value: 'America/Denver', label: 'Denver (MST)' },
      { value: 'America/Los_Angeles', label: 'Los Ángeles (PST)' },
      { value: 'America/Toronto', label: 'Toronto (EST)' },
      { value: 'America/Vancouver', label: 'Vancouver (PST)' },
    ],
  },
  {
    label: 'Europa',
    zones: [
      { value: 'Europe/London', label: 'Londres (GMT)' },
      { value: 'Europe/Madrid', label: 'Madrid (CET)' },
      { value: 'Europe/Paris', label: 'París (CET)' },
      { value: 'Europe/Berlin', label: 'Berlín (CET)' },
      { value: 'Europe/Rome', label: 'Roma (CET)' },
      { value: 'Europe/Moscow', label: 'Moscú (MSK)' },
      { value: 'UTC', label: 'UTC' },
    ],
  },
  {
    label: 'Asia / Pacífico',
    zones: [
      { value: 'Asia/Dubai', label: 'Dubái (GST)' },
      { value: 'Asia/Kolkata', label: 'India (IST)' },
      { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
      { value: 'Asia/Shanghai', label: 'China (CST)' },
      { value: 'Asia/Tokyo', label: 'Tokio (JST)' },
      { value: 'Asia/Seoul', label: 'Seúl (KST)' },
      { value: 'Australia/Sydney', label: 'Sídney (AEST)' },
      { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
    ],
  },
];
