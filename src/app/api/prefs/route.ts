import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DEMO_USER = 'demo-user';

export async function GET() {

  let user = await prisma.user.findUnique({ where: { id: DEMO_USER } });
  if (!user) user = await prisma.user.create({ data: { id: DEMO_USER, email: 'demo@example.com', name: 'Demo' } });

  let prefs = await prisma.userPrefs.findUnique({ where: { userId: DEMO_USER } });
  if (!prefs) prefs = await prisma.userPrefs.create({ data: { userId: DEMO_USER } });
  return NextResponse.json(prefs);
}

export async function PUT(req: Request) {
  const body = await req.json();
  const prefs = await prisma.userPrefs.upsert({
    where: { userId: DEMO_USER },
    update: body,
    create: { userId: DEMO_USER, ...body }
  });
  return NextResponse.json(prefs);
}
