import ICAL from 'ical.js';
import { prisma } from '@/lib/prisma';
import type { Prisma, Event as DbEvent } from '@prisma/client';

type ImportMode = 'RESPECT' | 'SMART';

export type ImportIcsOptions = {
    userEmail?: string;          // dueño de eventos
    calendarName?: string;       // calendario destino
    mode?: ImportMode;           // 'RESPECT' | 'SMART'
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

/** Modo SMART: crea origen y múltiples instancias (all-day por día de ocurrencia) */
// ⬇️ NUEVO TIPO con ids planos
type FlatBase = Omit<
    Prisma.EventCreateManyInput,
    'id' | 'originEventId' | 'uid' | 'start' | 'end' | 'createdAt' | 'updatedAt'
> & {
    // permitir start/end opcionales como Date (lo convertimos a ISO al crear)
    start?: Date | null;
    end?: Date | null;
};

// ⬇️ REEMPLAZA tu createSmartInstances por esta versión
async function createSmartInstances(
    base: FlatBase, // <-- plano: userId, calendarId, etc.
    comp: any,
    expandMonths: number,
) {
    // 1) Crear el "origen" (sin rrule expandida; start/end nulos para SMART)
    const origin = await prisma.event.create({
        data: {
            ...base,
            // nos aseguramos de nulos para que sea solo "origen lógico"
            start: null,
            end: null,
            isFixed: false,
            participatesInScheduling: true,
            repeat: 'NONE',
            rrule: rruleString(comp),
            durationMinutes:
                base.start && base.end
                    ? Math.max(1, Math.round(((base.end as any as Date).getTime() - (base.start as any as Date).getTime()) / 60000))
                    : null,
            status: 'SCHEDULED',
        },
    });

    // 2) Expandir ocurrencias
    const now = new Date();
    const until = new Date(now);
    until.setUTCMonth(until.getUTCMonth() + (expandMonths || 6));

    const ev = new ICAL.Event(comp);
    const durationMs =
        ev.duration?.toSeconds?.() ? (ev.duration.toSeconds() as number) * 1000 : null;

    const occs = expandOccurrences(comp, until);
    if (occs.length === 0) return [origin.id];

    // 3) Crear instancias (createMany requiere FKs planos)
    const creates: Prisma.EventCreateManyInput[] = occs.map((occ) => {
        const startAllDay = new Date(Date.UTC(occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate()));
        const endAllDay = new Date(startAllDay.getTime() + 24 * 60 * 60 * 1000);

        return {
            userId: base.userId,
            calendarId: base.calendarId,
            originEventId: origin.id,
            kind: 'EVENTO',
            title: base.title,
            description: base.description ?? null,
            location: base.location ?? null,
            category: base.category ?? null,

            start: startAllDay,
            end: durationMs ? new Date(startAllDay.getTime() + durationMs) : endAllDay,
            isAllDay: true,

            priority: (base.priority as any) ?? 'RELEVANTE',
            repeat: 'NONE',
            window: 'NONE',
            tzid: (base.tzid as string) ?? 'UTC',

            isFixed: false,
            participatesInScheduling: true,
            canOverlap: false,
            transparency: 'OPAQUE',
            status: 'SCHEDULED',
        };
    });

    const batch = await prisma.event.createMany({ data: creates });
    return [origin.id, `${batch.count} instances`];
}


/**
 * Importa el contenido ICS y aplica reglas:
 *  - All-day/multi-day => avisos (transparent, overlap, allDay, no scheduling)
 *  - Timed + RRULE:
 *       RESPECT => guarda start/end/rrule tal cual, participa, isFixed opcional
 *       SMART   => crea origen y expande ocurrencias como all-day reubicables
 */
export async function importIcsFromText(
    icsText: string,
    opts: ImportIcsOptions = {},
): Promise<{ importedIds: string[] }> {
    const {
        userEmail = 'demo@local',
        calendarName = 'Personal',
        mode = 'RESPECT',
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
        const transp = (getText(comp.getFirstProperty('transp')) as DbEvent['transparency']) ?? 'TRANSPARENT';
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

        // ===== Reglas de Comportamiento =====
        let transparency: DbEvent['transparency'] = transp === 'OPAQUE' ? 'OPAQUE' : 'TRANSPARENT';
        let canOverlap = transparency === 'TRANSPARENT';
        let participatesInScheduling = !isAllDay;
        let isFixed = !isAllDay;

        // 1) All-day/multi-day => Avisos
        if (isAllDay) {
            transparency = 'TRANSPARENT';
            canOverlap = true;
            participatesInScheduling = false;
            isFixed = false;
        }

        const whereByUid = uid
            ? { calendarId_uid: { calendarId: calendar.id, uid } as any }
            : null;

        // Datos base comunes
        // antes: usabas { user: { connect: ... }, calendar: { connect: ... } }
        // ahora: setea los FKs directamente
        const baseData = {
            userId: user.id,
            calendarId: calendar.id,
            kind: 'EVENTO' as const,
            title: summary,
            description,
            location,
            start,
            end: end ?? null,
            tzid,
            isAllDay,
            transparency,
            canOverlap,
            participatesInScheduling,
            isFixed,
            priority: 'RELEVANTE' as const,
            statusIcal,
            sequence,
            repeat: repeat as any,
            rrule: rrule ?? null,
            rdate: undefined as unknown as Prisma.InputJsonValue | undefined,
            exdate: undefined as unknown as Prisma.InputJsonValue | undefined,
            category: isAllDay ? 'AVISO' : null,
            status: 'SCHEDULED' as const,
        } satisfies FlatBase;


        // 2) Timed + RRULE => modos
        const isTimed = !!start && !isAllDay;
        const hasRrule = !!rrule;

        if (isTimed && hasRrule && mode === 'SMART') {
            // Crea origen + instancias expandibles
            const res = await createSmartInstances(baseData, comp, expandMonths);
            importedIds.push(...res.map(String));
            continue;
        }

        // RESPECT (o no recurrente)
        if (whereByUid) {
            const saved = await prisma.event.upsert({
                where: whereByUid,
                update: baseData,          // <-- plano
                create: { ...baseData, uid },
            });
            importedIds.push(saved.id);
        } else {
            const saved = await prisma.event.create({ data: baseData }); // <-- plano
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
