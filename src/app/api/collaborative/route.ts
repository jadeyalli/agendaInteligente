import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { collaborativeRepository } from '@/repositories/collaborative.repo';
import { collaborativeService } from '@/services/collaborative';

export const runtime = 'nodejs';

/** Lista los eventos colaborativos del usuario (como anfitrión y como invitado). */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const [hosted, invited] = await Promise.all([
      collaborativeRepository.findHostedByUser(user.id),
      collaborativeRepository.findInvitedForUser(user.id),
    ]);

    return NextResponse.json({ hosted, invited });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Crea un nuevo evento colaborativo. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const body = await req.json();
    const id = await collaborativeService.create(user.id, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
