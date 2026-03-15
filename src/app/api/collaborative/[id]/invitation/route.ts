import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/** Devuelve la invitación del usuario con slots traducidos a su zona horaria. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id } = await params;
    const invitation = await collaborativeService.getInvitation(id, user.id);
    return NextResponse.json(invitation);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
