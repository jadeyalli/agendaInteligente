import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { reservationsRepository } from '@/repositories/reservations.repo';

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
}

/** DELETE /api/reservations/[id] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const existing = await reservationsRepository.findById(id);
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await reservationsRepository.delete(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/reservations/[id] error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
