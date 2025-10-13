import { NextResponse } from 'next/server';
import { importIcsFromText } from '@/lib/ics/importIcs';

export const runtime = 'nodejs'; // necesitamos fs/Buffer

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const mode = (form.get('mode') as string) || 'RESPECT';
    const calendarName = (form.get('calendarName') as string) || 'Personal';
    // Si tienes auth real, reemplaza por usuario actual:
    const userEmail = (form.get('userEmail') as string) || 'demo@local';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Archivo .ics requerido' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.ics')) {
      return NextResponse.json({ error: 'Solo se permite .ics' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const icsText = buf.toString('utf8');

    const { importedIds } = await importIcsFromText(icsText, {
      userEmail,
      calendarName,
      mode: mode === 'SMART' ? 'SMART' : 'RESPECT',
      expandMonths: 6,
    });

    return NextResponse.json({ ok: true, count: importedIds.length, importedIds });
  } catch (e: any) {
    console.error('POST /api/import-ics', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
