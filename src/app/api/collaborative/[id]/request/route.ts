import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/**
 * Invitado ESSENTIAL solicita reagendar.
 * Body: { proposedSlots: [{ start, end }, { start, end }, { start, end }] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const requestId = await collaborativeService.requestReschedule(id, user.id, body);
    return NextResponse.json({ requestId }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
