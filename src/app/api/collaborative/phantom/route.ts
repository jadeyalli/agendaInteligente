import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/session';
import { collaborativeRepository } from '@/repositories/collaborative.repo';
import { prisma } from '@/lib/prisma';

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

const CreateSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  title: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(300).optional(),
});

/** Crea un bloque fantasma manual (sin collabEventId). */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos.', issues: parsed.error.flatten() }, { status: 400 });
    }

    const { start, end, title, reason } = parsed.data;
    if (end <= start) {
      return NextResponse.json({ error: 'La hora de fin debe ser posterior a la de inicio.' }, { status: 422 });
    }

    const block = await prisma.phantomBlock.create({
      data: { userId: user.id, start, end, title: title ?? null, reason: reason ?? null, isActive: true },
    });

    return NextResponse.json(block, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Elimina (desactiva) un bloque fantasma manual por id. */
export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

    const block = await prisma.phantomBlock.findUnique({ where: { id } });
    if (!block || block.userId !== user.id) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await prisma.phantomBlock.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
