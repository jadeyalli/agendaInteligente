// app/api/schedule/solve/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  DEFAULT_USER_SETTINGS,
  JS_DAY_TO_DAY_CODE,
  dayCodesToWeekdayIndexes,
  mergeUserSettings,
  parseEnabledDaysField,
  timeStringToParts,
  type DayCode,
  type UserSettingsValues,
} from '@/lib/user-settings';
import { Priority } from '@prisma/client';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

type SolvePayload = any;

// ———————————— Utils de tiempo ————————————
function endOfMonth(d = new Date()) {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return end;
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function toLocalISO(dt: Date) {
  // ISO sin tz => el solver lo interpretará en America/Mexico_City
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:00`;
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

  return new Promise<any>((resolve, reject) => {
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
      } catch (e: any) {
        reject(new Error('No se pudo parsear salida del solver: ' + e.message + '\n' + out));
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
) {
  const ranges: { start: string; end: string }[] = [];
  const enabled = new Set<DayCode>(settings.enabledDays);
  const { hour: startHour, minute: startMinute } = timeStringToParts(settings.dayStart);
  const { hour: endHour, minute: endMinute } = timeStringToParts(settings.dayEnd);

  const cursor = new Date(horizonStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizonEnd) {
    const dayCode = JS_DAY_TO_DAY_CODE[cursor.getDay()];
    if (dayCode && enabled.has(dayCode)) {
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
        ranges.push({ start: toLocalISO(start), end: toLocalISO(end) });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return ranges;
}

async function buildPayloadForUser(userId: string, extraNew?: any[]) {
  const tz = 'America/Mexico_City';
  const now = new Date();
  const horizonStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const horizonEnd = endOfMonth(now);

  const rawSettings = await prisma.userSettings.findUnique({ where: { userId } });
  const settings = rawSettings
    ? mergeUserSettings({
        dayStart: rawSettings.dayStart,
        dayEnd: rawSettings.dayEnd,
        enabledDays: parseEnabledDaysField(rawSettings.enabledDays),
        eventBufferMinutes: rawSettings.eventBufferMinutes,
        schedulingLeadMinutes: rawSettings.schedulingLeadMinutes,
      })
    : { ...DEFAULT_USER_SETTINGS };

  // Trae eventos del usuario
  const events = await prisma.event.findMany({
    where: { userId },
    orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
  });

  const fixed: any[] = [];
  const movable: any[] = [];

  for (const r of events) {
    const prio = mapPriorityToEisen(r.priority);
    const blocksCapacity = !!(r.isInPerson && !r.canOverlap);
    const durationMin = r.durationMinutes ?? minutesBetween(r.start ?? null, r.end ?? null) ?? 30;

    // UI (Crítica) y/o eventos fijos ya con hora se pasan como "fixed"
    if (prio === 'UI' && r.start && r.end) {
      fixed.push({
        id: r.id,
        start: toLocalISO(new Date(r.start)),
        end: toLocalISO(new Date(r.end)),
        isInPerson: r.isInPerson,
        canOverlap: r.canOverlap,
        blocksCapacity,
      });
      continue;
    }

    // UnI / InU
    if ((prio === 'UnI' || prio === 'InU')) {
      // Si tiene start/end ya asignados → movable (el solver puede moverlos si conviene)
      const currentStart = r.start ? toLocalISO(new Date(r.start)) : null;
      const window = (r.window ?? defaultWindowFor(r.priority)) as any;

      movable.push({
        id: r.id,
        priority: prio,
        durationMin,
        isInPerson: r.isInPerson,
        canOverlap: r.canOverlap,
        currentStart,
        window,
        windowStart: r.windowStart ? toLocalISO(new Date(r.windowStart)) : null,
        windowEnd: r.windowEnd ? toLocalISO(new Date(r.windowEnd)) : null,
      });
    }
  }

  const preferredRanges = generatePreferredRanges(horizonStart, horizonEnd, settings);
  const activeDays = Array.from(new Set(dayCodesToWeekdayIndexes(settings.enabledDays))).sort(
    (a, b) => a - b,
  );

  const payload: SolvePayload = {
    user: { id: userId, timezone: tz },
    horizon: {
      start: toLocalISO(horizonStart),
      end: toLocalISO(horizonEnd),
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
    weights: {
      move: { UnI: 20, InU: 10 },
      distancePerSlot: { UnI: 4, InU: 1 },
      offPreferencePerSlot: { UnI: 1, InU: 3 },
      crossDayPerEvent: { UnI: 2, InU: 1 },
    },
    policy: {
      allowWeekend: activeDays.some((d) => d >= 5),
      noOverlapCapacity: 1,
      remoteCapacity: 9999,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      activeDays,
      eventBufferMinutes: settings.eventBufferMinutes,
      schedulingLeadMinutes: settings.schedulingLeadMinutes,
    },
  };

  return payload;
}

// ———————————— RUTA: POST /api/schedule/solve ————————————
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
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
  } catch (e: any) {
    console.error('POST /api/schedule/solve error', e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}

