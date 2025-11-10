import { NextResponse } from 'next/server';
import { importIcsFromText } from '@/lib/ics/importIcs';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs'; // necesitamos fs/Buffer

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const mode = (form.get('mode') as string) || 'REMINDER';
    const rawCalendarName = (form.get('calendarName') as string) || 'Personal';
    const calendarIdField = form.get('calendarId');
    const calendarName = rawCalendarName.trim() || 'Personal';
    const calendarId = typeof calendarIdField === 'string' && calendarIdField.trim() ? calendarIdField.trim() : null;

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Archivo .ics requerido' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.ics')) {
      return NextResponse.json({ error: 'Solo se permite .ics' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const icsText = buf.toString('utf8');

    const { importedIds } = await importIcsFromText(icsText, {
      userId: user.id,
      calendarId,
      calendarName,
      mode: mode === 'SMART' ? 'SMART' : 'REMINDER',
      expandMonths: 6,
    });

    return NextResponse.json({ ok: true, count: importedIds.length, importedIds });
  } catch (e: unknown) {
    console.error('POST /api/import-ics', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
