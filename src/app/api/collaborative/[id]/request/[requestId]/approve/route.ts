import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/** Anfitrión aprueba una solicitud de reagendamiento. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id, requestId } = await params;
    await collaborativeService.approveRescheduleRequest(id, user.id, requestId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
