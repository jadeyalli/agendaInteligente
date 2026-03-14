import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function foldLine(line: string): string {
  // RFC 5545: lines > 75 octets must be folded
  const MAX = 75;
  if (Buffer.byteLength(line, 'utf8') <= MAX) return line;
  const chars = [...line];
  const parts: string[] = [];
  let current = '';
  for (const ch of chars) {
    if (Buffer.byteLength(current + ch, 'utf8') > MAX) {
      parts.push(current);
      current = ' ' + ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n');
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function toIcsDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const calendarFilter = searchParams.get('calendarId');

    const where: Parameters<typeof prisma.event.findMany>[0]['where'] = {
      userId: user.id,
    };
    if (calendarFilter && calendarFilter !== 'all') {
      where.calendarId = calendarFilter;
    }

    const [events, settings] = await Promise.all([
      prisma.event.findMany({
        where,
        orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
        take: 5000,
      }),
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
    ]);

    const userTimezone = settings?.timezone ?? 'UTC';
    const now = toIcsDate(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Agenda Inteligente//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcs('Agenda Inteligente')}`,
      `X-WR-TIMEZONE:${escapeIcs(userTimezone)}`,
    ];

    for (const ev of events) {
      if (ev.kind === 'TAREA') {
        // VTODO
        lines.push('BEGIN:VTODO');
        lines.push(`UID:${ev.uid ?? ev.id}@agenda-inteligente`);
        lines.push(`DTSTAMP:${now}`);
        lines.push(`CREATED:${toIcsDate(ev.createdAt)}`);
        lines.push(`LAST-MODIFIED:${toIcsDate(ev.updatedAt)}`);
        lines.push(foldLine(`SUMMARY:${escapeIcs(ev.title)}`));
        if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeIcs(ev.description)}`));
        if (ev.category) lines.push(foldLine(`CATEGORIES:${escapeIcs(ev.category)}`));
        if (ev.dueDate) lines.push(`DUE;VALUE=DATE:${toIcsDateOnly(ev.dueDate)}`);
        if (ev.priority === 'CRITICA') lines.push('PRIORITY:1');
        else if (ev.priority === 'URGENTE') lines.push('PRIORITY:3');
        else if (ev.priority === 'RELEVANTE') lines.push('PRIORITY:5');
        else lines.push('PRIORITY:9');
        const todoStatus =
          ev.todoStatus === 'COMPLETED' ? 'COMPLETED' :
          ev.todoStatus === 'IN_PROCESS' ? 'IN-PROCESS' :
          ev.todoStatus === 'CANCELLED' ? 'CANCELLED' : 'NEEDS-ACTION';
        lines.push(`STATUS:${todoStatus}`);
        if (ev.completedAt) lines.push(`COMPLETED:${toIcsDate(ev.completedAt)}`);
        lines.push('END:VTODO');
        continue;
      }

      // VEVENT
      if (!ev.start) continue; // sin fecha → no exportable como VEVENT

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.uid ?? ev.id}@agenda-inteligente`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`CREATED:${toIcsDate(ev.createdAt)}`);
      lines.push(`LAST-MODIFIED:${toIcsDate(ev.updatedAt)}`);
      lines.push(`SEQUENCE:${ev.sequence ?? 0}`);

      if (ev.isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${toIcsDateOnly(ev.start)}`);
        if (ev.end) {
          // iCal: DTEND for all-day is exclusive next day
          const nextDay = new Date(ev.end);
          nextDay.setDate(nextDay.getDate() + 1);
          lines.push(`DTEND;VALUE=DATE:${toIcsDateOnly(nextDay)}`);
        }
      } else {
        const tzid = ev.tzid ?? 'UTC';
        if (tzid === 'UTC') {
          lines.push(`DTSTART:${toIcsDate(ev.start)}`);
          if (ev.end) lines.push(`DTEND:${toIcsDate(ev.end)}`);
        } else {
          lines.push(`DTSTART;TZID=${tzid}:${toIcsDate(ev.start).replace('Z', '')}`);
          if (ev.end) lines.push(`DTEND;TZID=${tzid}:${toIcsDate(ev.end).replace('Z', '')}`);
        }
      }

      lines.push(foldLine(`SUMMARY:${escapeIcs(ev.title)}`));
      if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeIcs(ev.description)}`));
      if (ev.category) lines.push(foldLine(`CATEGORIES:${escapeIcs(ev.category)}`));
      if (ev.location) lines.push(foldLine(`LOCATION:${escapeIcs(ev.location)}`));

      const status =
        ev.statusIcal === 'TENTATIVE' ? 'TENTATIVE' :
        ev.statusIcal === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED';
      lines.push(`STATUS:${status}`);

      const transp = ev.transparency === 'TRANSPARENT' ? 'TRANSPARENT' : 'OPAQUE';
      lines.push(`TRANSP:${transp}`);

      if (ev.rrule) lines.push(foldLine(`RRULE:${ev.rrule.replace(/^FREQ/, 'FREQ')}`));

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const icsContent = lines.join('\r\n') + '\r\n';
    const filename = `agenda-inteligente-${new Date().toISOString().slice(0, 10)}.ics`;

    return new Response(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    console.error('GET /api/export-ics error', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
