import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { validateEmail, validatePassword, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ message: 'Solicitud inválida.' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!validateEmail(email)) {
    return NextResponse.json({ message: 'El correo debe contener un @.' }, { status: 400 });
  }

  if (!validatePassword(password)) {
    return NextResponse.json({ message: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { calendars: { select: { id: true } } },
  });

  if (!user) {
    return NextResponse.json({ message: 'Credenciales inválidas.' }, { status: 401 });
  }

  const isValid = verifyPassword(password, user.password);

  if (!isValid) {
    return NextResponse.json({ message: 'Credenciales inválidas.' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('sessionUser', user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return NextResponse.json({
    message: 'Inicio de sesión exitoso.',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      calendarIds: user.calendars.map((calendar) => calendar.id),
    },
  });
}
