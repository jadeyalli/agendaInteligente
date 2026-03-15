import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/** Invitado acepta el horario confirmado. Retorna cambios de reagendamiento para confirmación. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id } = await params;
    const result = await collaborativeService.acceptConfirmedSlot(id, user.id);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
