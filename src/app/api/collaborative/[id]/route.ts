import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeRepository } from '@/repositories/collaborative.repo';

export const runtime = 'nodejs';

/** Devuelve el detalle completo de un evento colaborativo. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id } = await params;
    const event = await collaborativeRepository.findByIdWithRelations(id);
    if (!event) return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 });

    return NextResponse.json(event);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
