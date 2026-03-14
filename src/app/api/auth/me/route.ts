import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 422 });
  }

  const { name, email } = parsed.data;

  if (email && email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Ese correo ya está en uso.' }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { ...(name !== undefined ? { name } : {}), ...(email !== undefined ? { email } : {}) },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json(updated);
}
