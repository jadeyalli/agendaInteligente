import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/prisma';
import { hashPassword, validateEmail, validatePassword } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ message: 'Solicitud inválida.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!validateEmail(email)) {
    return NextResponse.json({ message: 'El correo debe contener un @.' }, { status: 400 });
  }

  if (!validatePassword(password)) {
    return NextResponse.json({ message: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    return NextResponse.json({ message: 'El correo ya está registrado.' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name: name || null,
      email,
      password: hashPassword(password),
      calendars: {
        create: {
          name: 'Calendario principal',
          color: '#6366F1',
        },
      },
    },
    include: {
      calendars: { select: { id: true } },
    },
  });

  const cookieStore = await cookies();
  cookieStore.set('sessionUser', user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  return NextResponse.json({
    message: 'Cuenta creada correctamente.',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      calendarIds: user.calendars.map((calendar) => calendar.id),
    },
  });
}
