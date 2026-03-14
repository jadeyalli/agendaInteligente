import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'ok', timestamp });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'db error';
    return NextResponse.json(
      { status: 'error', db: 'error', message, timestamp },
      { status: 503 },
    );
  }
}
