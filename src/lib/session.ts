import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import type { User } from '@prisma/client';

/**
 * Obtiene el usuario autenticado a partir de la cookie `sessionUser`.
 * Devuelve null si no existe sesión válida.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('sessionUser');
  if (!session?.value) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: session.value } });
  if (!user) {
    // Si la cookie apunta a un usuario inexistente, la ignoramos.
    return null;
  }

  return user;
}
