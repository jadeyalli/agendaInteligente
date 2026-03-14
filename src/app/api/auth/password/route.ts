import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/auth';

const Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.'),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 422 });
  }

  const { currentPassword, newPassword } = parsed.data;

  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  if (!record) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

  const valid = verifyPassword(currentPassword, record.password);
  if (!valid) return NextResponse.json({ error: 'La contraseña actual es incorrecta.' }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashPassword(newPassword) },
  });

  return NextResponse.json({ ok: true });
}
