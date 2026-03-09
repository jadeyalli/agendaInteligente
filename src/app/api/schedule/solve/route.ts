// app/api/schedule/solve/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  JS_DAY_TO_DAY_CODE,
  dayCodesToWeekdayIndexes,
  levelsToWeights,
  mergeUserSettings,
  parseEnabledDaysField,
  timeStringToParts,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';
import { dateToDateStringLocal, dateToTimeStringLocal } from '@/lib/timezone';
import { Priority } from '@prisma/client';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

interface SolvePayload {
  user: { id: string; timezone: string };
  horizon: { start: string; end: string; slotMinutes: number };
  availability: { preferred: { start: string; end: string }[]; fallbackUsed: boolean };
  events: {
    fixed: unknown[];
    movable: unknown[];
    new: unknown[];
    newFixed: unknown[];
  };
  weights: Record<string, Record<string, number>>;
  policy: Record<string, unknown>;
}

// ———————————— Utils de tiempo ————————————
function endOfMonth(d = new Date()) {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return end;
}

function toLocalISO(dt: Date, tz: string): string {
  // Genera ISO naive que el solver interpretará en la timezone del usuario
  const datePart = dateToDateStringLocal(dt, tz);  // "YYYY-MM-DD" en la tz del usuario
  const timePart = dateToTimeStringLocal(dt, tz);  // "HH:MM" en la tz del usuario
  return `${datePart}T${timePart}:00`;
}

function minutesBetween(a?: Date | null, b?: Date | null) {
  if (!a || !b) return null;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
}
function mapPriorityToEisen(p: Priority): 'UI'|'UnI'|'InU'|'NN' {
  switch (p) {
    case 'CRITICA': return 'UI';
    case 'URGENTE': return 'UnI';
    case 'RELEVANTE': return 'InU';
    default: return 'NN';
  }
}
function defaultWindowFor(p: Priority): 'PRONTO'|'SEMANA'|'MES' {
  if (p === 'URGENTE') return 'PRONTO';
  if (p === 'RELEVANTE') return 'MES';
  return 'SEMANA';
}

// ———————————— Llamada al solver (python) ————————————
async function runSolver(input: SolvePayload) {
  const pythonBin = process.env.PYTHON_BIN || 'python'; // setea PYTHON_BIN si usas otro
  const script = process.cwd() + '/solver.py';

  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(pythonBin, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    child.on('error', (e) => reject(new Error('No se pudo ejecutar Python: ' + e.message)));
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Solver salió con código ${code}\n${err || out}`));
      }
      try {
        const json = JSON.parse(out.trim());
        resolve(json);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        reject(new Error('No se pudo parsear salida del solver: ' + msg + '\n' + out));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

// ———————————— Construye payload desde BD ————————————
function clampDate(date: Date, min: Date, max: Date) {
  const time = Math.min(Math.max(date.getTime(), min.getTime()), max.getTime());
  return new Date(time);
}

function generatePreferredRanges(
  horizonStart: Date,
  horizonEnd: Date,
  settings: UserSettingsValues,
  tz: string,
  perDaySlots?: Map<number, { startTime: string; endTime: string }>,
) {
  const ranges: { start: string; end: string }[] = [];
  const enabled = new Set<DayCode>(settings.enabledDays);
  const globalStart = timeStringToParts(settings.dayStart);
  const globalEnd = timeStringToParts(settings.dayEnd);

  const cursor = new Date(horizonStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizonEnd) {
    const jsDay = cursor.getDay();
    const dayCode = JS_DAY_TO_DAY_CODE[jsDay];
    if (dayCode && enabled.has(dayCode)) {
      // Use per-day slot if available, otherwise fall back to global
      const slot = perDaySlots?.get(jsDay);
      const { hour: startHour, minute: startMinute } = slot
        ? timeStringToParts(slot.startTime)
        : globalStart;
      const { hour: endHour, minute: endMinute } = slot
        ? timeStringToParts(slot.endTime)
        : globalEnd;

      const dayStart = new Date(cursor);
      dayStart.setHours(startHour, startMinute, 0, 0);
      let dayEnd = new Date(cursor);
      dayEnd.setHours(endHour, endMinute, 0, 0);

      if (dayEnd <= dayStart) {
        const fallbackStart = new Date(cursor);
        fallbackStart.setHours(0, 0, 0, 0);
        dayStart.setTime(fallbackStart.getTime());
        dayEnd = new Date(fallbackStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
      }

      const start = clampDate(dayStart, horizonStart, horizonEnd);
      const end = clampDate(dayEnd, horizonStart, horizonEnd);
      if (end.getTime() > start.getTime()) {
        ranges.push({ start: toLocalISO(start, tz), end: toLocalISO(end, tz) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}

async function buildPayloadForUser(userId: string, extraNew?: unknown[]) {
  const now = new Date();
  const horizonStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const horizonEnd = endOfMonth(now);

  const [rawSettings, slotRecords] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.availabilitySlot.findMany({ where: { userId } }),
  ]);
  const tz = rawSettings?.timezone ?? 'America/Mexico_City';

  // Build per-day slots map (keyed by JS dayOfWeek)
  const perDaySlots = new Map<number, { startTime: string; endTime: string }>();
  for (const s of slotRecords) {
    perDaySlots.set(s.dayOfWeek, { startTime: s.startTime, endTime: s.endTime });
  }

  const settings = rawSettings
    ? mergeUserSettings({
        dayStart: rawSettings.dayStart,
        dayEnd: rawSettings.dayEnd,
        enabledDays: parseEnabledDaysField(rawSettings.enabledDays),
        eventBufferMinutes: rawSettings.eventBufferMinutes,
        schedulingLeadMinutes: rawSettings.schedulingLeadMinutes,
        timezone: rawSettings.timezone,
        weightStability: rawSettings.weightStability,
        weightUrgency: rawSettings.weightUrgency,
        weightWorkHours: rawSettings.weightWorkHours,
        weightCrossDay: rawSettings.weightCrossDay,
      })
    : { ...DEFAULT_USER_SETTINGS };

  // Trae eventos del usuario
  const events = await prisma.event.findMany({
    where: { userId },
    orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
  });

  const fixed: unknown[] = [];
  const movable: unknown[] = [];

  for (const r of events) {
    const prio = mapPriorityToEisen(r.priority);
    const blocksCapacity = !!(r.isInPerson && !r.canOverlap);
    const durationMin = r.durationMinutes ?? minutesBetween(r.start ?? null, r.end ?? null) ?? 30;

    // UI (Crítica) y/o eventos fijos ya con hora se pasan como "fixed"
    if (prio === 'UI' && r.start && r.end) {
      fixed.push({
        id: r.id,
        start: toLocalISO(new Date(r.start), tz),
        end: toLocalISO(new Date(r.end), tz),
        isInPerson: r.isInPerson,
        canOverlap: r.canOverlap,
        blocksCapacity,
      });
      continue;
    }

    // UnI / InU
    if ((prio === 'UnI' || prio === 'InU')) {
      const currentStart = r.start ? toLocalISO(new Date(r.start), tz) : null;
      const window = (r.window ?? defaultWindowFor(r.priority)) as 'PRONTO'|'SEMANA'|'MES'|'RANGO';

      movable.push({
        id: r.id,
        priority: prio,
        durationMin,
        isInPerson: r.isInPerson,
        canOverlap: r.canOverlap,
        currentStart,
        window,
        windowStart: r.windowStart ? toLocalISO(new Date(r.windowStart), tz) : null,
        windowEnd: r.windowEnd ? toLocalISO(new Date(r.windowEnd), tz) : null,
      });
    }
  }

  const preferredRanges = generatePreferredRanges(horizonStart, horizonEnd, settings, tz, perDaySlots);
  const activeDays = Array.from(new Set(dayCodesToWeekdayIndexes(settings.enabledDays))).sort(
    (a, b) => a - b,
  );

  const payload: SolvePayload = {
    user: { id: userId, timezone: tz },
    horizon: {
      start: toLocalISO(horizonStart, tz),
      end: toLocalISO(horizonEnd, tz),
      slotMinutes: 30,
    },
    availability: {
      preferred: preferredRanges,
      fallbackUsed: preferredRanges.length === 0,
    },
    events: {
      fixed,
      movable,
      new: extraNew ?? [],
      newFixed: [],
    },
    weights: levelsToWeights(settings),
    policy: {
      allowWeekend: activeDays.some((d) => d >= 5),
      noOverlapCapacity: 1,
      remoteCapacity: 9999,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      activeDays,
      eventBufferMinutes: settings.eventBufferMinutes,
      schedulingLeadMinutes: settings.schedulingLeadMinutes,
      perDaySlots: Object.fromEntries(perDaySlots),
    },
  };

  return payload;
}

// ———————————— RUTA: POST /api/schedule/solve ————————————
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // body puede traer: { new: [ {id, priority: "UnI"|"InU", durationMin, isInPerson, canOverlap, window, windowStart, windowEnd} ] }
    // Si no trae "new", solo re-optimiza lo existente.
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const extraNew = Array.isArray(body?.new) ? body.new : [];
    const payload = await buildPayloadForUser(user.id, extraNew);
    const result = await runSolver(payload);

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Server error';
    console.error('POST /api/schedule/solve error', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
