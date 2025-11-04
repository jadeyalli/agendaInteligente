import { NextResponse } from 'next/server';
import { __internalClearSessionCookie } from 'next-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  __internalClearSessionCookie(response);
  return response;
}
