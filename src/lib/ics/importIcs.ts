import ICAL from 'ical.js';
import { prisma } from '@/lib/prisma';
import type { Event as DbEvent } from '@prisma/client';

type ImportMode = 'REMINDER' | 'SMART';

export type ImportIcsOptions = {
    userEmail?: string;          // dueño de eventos
    calendarName?: string;       // calendario destino
    mode?: ImportMode;           // 'REMINDER' | 'SMART'
    expandMonths?: number;       // para SMART (default 6)
};

function getText(prop?: any): string | undefined {
    if (!prop) return undefined;
    const v =
        prop.getFirstValue?.() ??
        prop.getValues?.()?.[0] ??
        prop._values?.[0] ??
        prop._value;
    return v != null ? String(v) : undefined;
}

function toDate(val: any): Date | null {
    if (!val) return null;
    try {
        return val.toJSDate();
    } catch {
        return null;
    }
}

function detectAllDay(comp: any): boolean {
    const dtstart = comp.getFirstPropertyValue('dtstart') as any;
    return !!dtstart?.isDate;
}

function extractTzid(comp: any): string | undefined {
    const p = comp.getFirstProperty('dtstart');
    const tzid = p?.getParameter?.('tzid') || p?._parameters?.tzid;
    return tzid ? String(tzid) : undefined;
}

function rruleString(comp: any): string | null {
    const rr = comp.getFirstProperty('rrule');
    if (!rr) return null;
    const v = rr._value ?? rr.getFirstValue?.();
    try {
        return v?.toString?.() ?? null;
    } catch {
        return null;
    }
}

function inferRepeatFromRRULE(rrule?: string | null) {
    if (!rrule) return 'NONE';
    const up = rrule.toUpperCase();
    if (up.includes('FREQ=DAILY')) return 'DAILY';
    if (up.includes('FREQ=WEEKLY')) return 'WEEKLY';
    if (up.includes('FREQ=MONTHLY')) return 'MONTHLY';
    if (up.includes('FREQ=YEARLY')) return 'YEARLY';
    return 'NONE';
}

function addDays(date: Date, days: number) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function minutesDiff(a: Date, b: Date) {
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function ensureDurationMs(start: Date, end: Date | null, isAllDay: boolean): number {
    if (end && end.getTime() > start.getTime()) {
        return end.getTime() - start.getTime();
    }
    if (isAllDay) {
        return DAY_MS;
    }
    return HOUR_MS;
}

function toAllDayBounds(start: Date, end: Date | null): { start: Date; end: Date } {
    const startUtc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

    if (!end) {
        return { start: startUtc, end: new Date(startUtc.getTime() + DAY_MS) };
    }

    const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    if (endUtc.getTime() <= startUtc.getTime()) {
        return { start: startUtc, end: new Date(startUtc.getTime() + DAY_MS) };
    }

    return { start: startUtc, end: endUtc };
}

async function ensureUserAndCalendar(email: string, calendarName: string) {
    const user =
        (await prisma.user.findUnique({ where: { email } })) ??
        (await prisma.user.create({ data: { email, name: 'Importado' } }));

    const calendar =
        (await prisma.calendar.findFirst({
            where: { userId: user.id, name: calendarName },
        })) ??
        (await prisma.calendar.create({
            data: { userId: user.id, name: calendarName, timezone: 'UTC' },
        }));

    return { user, calendar };
}

/** Expande una VEVENT recurrente hasta 'until' (incluido aprox.) */
function expandOccurrences(comp: any, until: Date): Date[] {
    const ev = new ICAL.Event(comp);
    const dates: Date[] = [];

    if (!ev.isRecurring()) {
        const s = ev.startDate?.toJSDate?.();
        if (s) dates.push(s);
        return dates;
    }

    const it = ev.iterator();
    const limit = ICAL.Time.fromJSDate(until);
    let next: any;
    while ((next = it.next())) {
        if (next.compare(limit) > 0) break;
        dates.push(next.toJSDate());
    }
    return dates;
}

/**
 * Importa el contenido ICS y aplica reglas:
 *  - REMINDER => todos los eventos se convierten en recordatorios de día completo sin participación en el motor inteligente.
 *  - SMART    => los eventos con horario se registran como relevantes flexibles respetando la frecuencia; los all-day continúan como recordatorios.
 */
export async function importIcsFromText(
    icsText: string,
    opts: ImportIcsOptions = {},
): Promise<{ importedIds: string[] }> {
    const {
        userEmail = 'demo@local',
        calendarName = 'Personal',
        mode = 'REMINDER',
        expandMonths = 6,
    } = opts;

    const jcal = ICAL.parse(icsText);
    const vcal = new ICAL.Component(jcal);
    const vevents = vcal.getAllSubcomponents('vevent');

    const { user, calendar } = await ensureUserAndCalendar(userEmail, calendarName);

    const importedIds: string[] = [];

    for (const comp of vevents) {
        const uid = getText(comp.getFirstProperty('uid'));
        const summary = getText(comp.getFirstProperty('summary')) ?? '(Sin título)';
        const description = getText(comp.getFirstProperty('description')) ?? null;
        const location = getText(comp.getFirstProperty('location')) ?? null;
        const statusIcal = (getText(comp.getFirstProperty('status')) as DbEvent['statusIcal']) ?? 'CONFIRMED';
        const seqStr = getText(comp.getFirstProperty('sequence'));
        const sequence = seqStr ? Number(seqStr) : 0;

        const dtstartVal = comp.getFirstPropertyValue('dtstart') as any;
        const dtendVal = comp.getFirstPropertyValue('dtend') as any;
        const start = toDate(dtstartVal)!;
        let end = toDate(dtendVal);
        const isAllDay = detectAllDay(comp);
        if (isAllDay && !end) end = addDays(start, 1);

        const tzid = extractTzid(comp) || 'UTC';
        const rrule = rruleString(comp);
        const repeat = inferRepeatFromRRULE(rrule);

        const whereByUid = uid
            ? { calendarId_uid: { calendarId: calendar.id, uid } as any }
            : null;

        const durationMs = ensureDurationMs(start, end ?? null, isAllDay);
        const computedEnd = end ?? new Date(start.getTime() + durationMs);

        if (mode === 'REMINDER' || (mode === 'SMART' && isAllDay)) {
            const { start: allDayStart, end: allDayEnd } = toAllDayBounds(start, end ?? null);
            const reminderData = {
                userId: user.id,
                calendarId: calendar.id,
                kind: 'EVENTO' as const,
                title: summary,
                description,
                location,
                start: allDayStart,
                end: allDayEnd,
                tzid,
                isAllDay: true,
                transparency: 'TRANSPARENT' as DbEvent['transparency'],
                canOverlap: true,
                participatesInScheduling: false,
                isFixed: false,
                priority: 'RELEVANTE' as const,
                statusIcal,
                sequence,
                repeat: repeat as any,
                rrule: rrule ?? null,
                category: 'AVISO',
                status: 'SCHEDULED' as const,
                window: 'NONE' as const,
                windowStart: null,
                windowEnd: null,
                durationMinutes: minutesDiff(allDayStart, allDayEnd),
            };

            if (whereByUid) {
                const saved = await prisma.event.upsert({
                    where: whereByUid,
                    update: reminderData,
                    create: uid ? { ...reminderData, uid } : reminderData,
                });
                importedIds.push(saved.id);
            } else {
                const saved = await prisma.event.create({ data: reminderData });
                importedIds.push(saved.id);
            }
            continue;
        }

        const smartBase = {
            userId: user.id,
            calendarId: calendar.id,
            kind: 'EVENTO' as const,
            title: summary,
            description,
            location,
            tzid,
            isAllDay: false,
            transparency: 'OPAQUE' as DbEvent['transparency'],
            canOverlap: false,
            participatesInScheduling: true,
            isFixed: false,
            priority: 'RELEVANTE' as const,
            statusIcal,
            sequence,
            category: null,
            status: 'SCHEDULED' as const,
            window: 'NONE' as const,
            windowStart: null,
            windowEnd: null,
        };

        const smartDurationMinutes = Math.max(1, Math.round(durationMs / 60000));
        const hasRrule = !!rrule;

        if (hasRrule) {
            if (uid) {
                const existing = await prisma.event.findFirst({
                    where: {
                        calendarId: calendar.id,
                        uid,
                    },
                });
                if (existing) {
                    await prisma.event.deleteMany({
                        where: {
                            OR: [
                                { id: existing.id },
                                { originEventId: existing.id },
                            ],
                        },
                    });
                }
            }

            const now = new Date();
            const until = new Date(now);
            until.setUTCMonth(until.getUTCMonth() + (expandMonths || 6));

            const occurrences = expandOccurrences(comp, until);
            const ordered = occurrences.length ? occurrences.sort((a, b) => a.getTime() - b.getTime()) : [start];

            const masterStart = ordered[0];
            const masterEnd = new Date(masterStart.getTime() + durationMs);
            const masterData = {
                ...smartBase,
                start: masterStart,
                end: masterEnd,
                durationMinutes: smartDurationMinutes,
                repeat: repeat as any,
                rrule: rrule ?? null,
                ...(uid ? { uid } : {}),
            };
            const master = await prisma.event.create({ data: masterData });
            importedIds.push(master.id);

            const rest = ordered.slice(1);
            for (const occ of rest) {
                const occEnd = new Date(occ.getTime() + durationMs);
                const child = await prisma.event.create({
                    data: {
                        ...smartBase,
                        originEventId: master.id,
                        start: occ,
                        end: occEnd,
                        durationMinutes: smartDurationMinutes,
                        repeat: 'NONE',
                        rrule: null,
                    },
                });
                importedIds.push(child.id);
            }
            continue;
        }

        if (whereByUid) {
            const saved = await prisma.event.upsert({
                where: whereByUid,
                update: {
                    ...smartBase,
                    start,
                    end: computedEnd,
                    durationMinutes: smartDurationMinutes,
                    repeat: repeat as any,
                    rrule: rrule ?? null,
                },
                create: uid
                    ? {
                          ...smartBase,
                          start,
                          end: computedEnd,
                          durationMinutes: smartDurationMinutes,
                          repeat: repeat as any,
                          rrule: rrule ?? null,
                          uid,
                      }
                    : {
                          ...smartBase,
                          start,
                          end: computedEnd,
                          durationMinutes: smartDurationMinutes,
                          repeat: repeat as any,
                          rrule: rrule ?? null,
                      },
            });
            importedIds.push(saved.id);
        } else {
            const saved = await prisma.event.create({
                data: {
                    ...smartBase,
                    start,
                    end: computedEnd,
                    durationMinutes: smartDurationMinutes,
                    repeat: repeat as any,
                    rrule: rrule ?? null,
                },
            });
            importedIds.push(saved.id);
        }
    }

    return { importedIds };
}

/** Variante para CLI o node: lee un archivo y llama a importIcsFromText */
import { readFileSync } from 'node:fs';
export async function importIcsFromFile(
    filePath: string,
    opts?: ImportIcsOptions,
) {
    const icsText = readFileSync(filePath, 'utf8');
    return importIcsFromText(icsText, opts);
}
