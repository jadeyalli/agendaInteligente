import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { SchedulingService } from '@/services/scheduling';

export const runtime = 'nodejs';

const schedulingService = new SchedulingService();

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const newEvents = Array.isArray(body?.new) ? body.new : [];

    const result = await schedulingService.solve(user.id, newEvents);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    console.error('POST /api/schedule/solve error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
