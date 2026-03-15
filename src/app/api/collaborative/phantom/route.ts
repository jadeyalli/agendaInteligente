import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { collaborativeRepository } from '@/repositories/collaborative.repo';

export const runtime = 'nodejs';

/** Devuelve los bloques fantasma activos del usuario actual. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const blocks = await collaborativeRepository.findActivePhantomBlocks(user.id);
    return NextResponse.json(blocks);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
