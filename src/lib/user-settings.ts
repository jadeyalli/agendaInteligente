export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface UserSettingsValues {
  dayStart: string;
  dayEnd: string;
  enabledDays: DayCode[];
  eventBufferMinutes: number;
  schedulingLeadMinutes: number;
  timezone: string;
  weightStability: 1 | 2 | 3;
  weightUrgency: 1 | 2 | 3;
  weightWorkHours: 1 | 2 | 3;
  weightCrossDay: 1 | 2 | 3;
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
  timezone: 'America/Mexico_City',
  weightStability: 2,
  weightUrgency: 2,
  weightWorkHours: 2,
  weightCrossDay: 2,
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

export function sanitizeWeightLevel(value: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (num === 1 || num === 2 || num === 3) return num;
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

type MergeInput = Omit<
  Partial<UserSettingsValues>,
  'weightStability' | 'weightUrgency' | 'weightWorkHours' | 'weightCrossDay'
> & {
  weightStability?: number;
  weightUrgency?: number;
  weightWorkHours?: number;
  weightCrossDay?: number;
};

export function mergeUserSettings(partial?: MergeInput | null): UserSettingsValues {
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
    schedulingLeadMinutes: sanitizePositiveInteger(
      partial.schedulingLeadMinutes,
      DEFAULT_USER_SETTINGS.schedulingLeadMinutes,
    ),
    timezone: sanitizeTimezone(partial.timezone, DEFAULT_USER_SETTINGS.timezone),
    weightStability: sanitizeWeightLevel(partial.weightStability, DEFAULT_USER_SETTINGS.weightStability),
    weightUrgency: sanitizeWeightLevel(partial.weightUrgency, DEFAULT_USER_SETTINGS.weightUrgency),
    weightWorkHours: sanitizeWeightLevel(partial.weightWorkHours, DEFAULT_USER_SETTINGS.weightWorkHours),
    weightCrossDay: sanitizeWeightLevel(partial.weightCrossDay, DEFAULT_USER_SETTINGS.weightCrossDay),
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

// ———————————— Solver weight conversion ————————————

export type SolverWeights = {
  move: { UnI: number; InU: number };
  distancePerSlot: { UnI: number; InU: number };
  offPreferencePerSlot: { UnI: number; InU: number };
  crossDayPerEvent: { UnI: number; InU: number };
};

const WEIGHT_STABILITY_MAP: Record<1 | 2 | 3, { UnI: number; InU: number }> = {
  1: { UnI: 5, InU: 5 },
  2: { UnI: 20, InU: 10 },
  3: { UnI: 50, InU: 25 },
};

const WEIGHT_URGENCY_MAP: Record<1 | 2 | 3, { UnI: number; InU: number }> = {
  1: { UnI: 1, InU: 0 },
  2: { UnI: 4, InU: 1 },
  3: { UnI: 8, InU: 3 },
};

const WEIGHT_WORKHOURS_MAP: Record<1 | 2 | 3, { UnI: number; InU: number }> = {
  1: { UnI: 0, InU: 1 },
  2: { UnI: 1, InU: 3 },
  3: { UnI: 3, InU: 8 },
};

const WEIGHT_CROSSDAY_MAP: Record<1 | 2 | 3, { UnI: number; InU: number }> = {
  1: { UnI: 0, InU: 0 },
  2: { UnI: 2, InU: 1 },
  3: { UnI: 5, InU: 3 },
};

export function levelsToWeights(
  settings: Pick<UserSettingsValues, 'weightStability' | 'weightUrgency' | 'weightWorkHours' | 'weightCrossDay'>,
): SolverWeights {
  return {
    move: WEIGHT_STABILITY_MAP[settings.weightStability],
    distancePerSlot: WEIGHT_URGENCY_MAP[settings.weightUrgency],
    offPreferencePerSlot: WEIGHT_WORKHOURS_MAP[settings.weightWorkHours],
    crossDayPerEvent: WEIGHT_CROSSDAY_MAP[settings.weightCrossDay],
  };
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
