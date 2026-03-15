import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/** Registra el voto del usuario por un slot. Body: { slotId: string } */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id } = await params;
    const body: { slotId?: string } = await req.json();
    if (!body.slotId) return NextResponse.json({ error: 'slotId requerido.' }, { status: 400 });

    await collaborativeService.vote(id, user.id, body.slotId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
