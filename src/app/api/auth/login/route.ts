import { NextResponse } from 'next/server';
import { authenticateWithCredentials, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/credentials';
import { __internalSetSessionCookie } from 'next-auth';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const credentials = (body ?? {}) as { email?: string; password?: string };

  const session = authenticateWithCredentials(credentials);

  if (!session) {
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
  }

  const response = NextResponse.json({ session });
  __internalSetSessionCookie(response, session, { maxAge: SESSION_MAX_AGE_SECONDS });

  return response;
}
