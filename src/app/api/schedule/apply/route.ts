import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/session';
import { SchedulingService } from '@/services/scheduling';
import { SolverOutputSchema } from '@/domain/solver-contract';

export const runtime = 'nodejs';

const schedulingService = new SchedulingService();

/** POST /api/schedule/apply — aplica los cambios aprobados por el usuario */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Payload vacío.' }, { status: 400 });
    }

    const parsed = SolverOutputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Formato de resultado inválido.', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await schedulingService.applyApprovedChanges(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno';
    console.error('POST /api/schedule/apply error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
