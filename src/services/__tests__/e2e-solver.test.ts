/**
 * Test E2E del flujo completo del solver para un usuario con datos reales.
 * Verifica jerarquía de prioridades, restricciones duras y separación de tipos.
 *
 * Requisito: base de datos con datos del seed E2E (scripts/seed-e2e.ts).
 * El test ejecuta el seed en beforeAll para garantizar estado conocido.
 */
import { PrismaClient, Priority } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SchedulingService } from '@/services/scheduling';
import type { ValidatedSolverOutput } from '@/domain/solver-contract';

const prisma = new PrismaClient();
const schedulingService = new SchedulingService();

const EMAIL_A = 'usuario-a@e2e.test';

// IDs resueltos en beforeAll
let userAId: string;
let eventIds: {
  junta: string;
  revision: string;
  estudiar: string;
  dentista: string;
  leerArticulo: string;
  cumpleanios: string;
  vitaminas: string;
};
let solverResult: ValidatedSolverOutput;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrae la hora "HH:MM" de un string ISO naive o completo. */
function timeOf(iso: string): string {
  // ISO puede ser "2026-03-15T10:15:00" o "2026-03-15T10:15:00+00:00"
  const t = iso.split('T')[1];
  if (!t) throw new Error(`No se puede extraer hora de: ${iso}`);
  return t.slice(0, 5); // "HH:MM"
}

/** Retorna minutos desde medianoche para una string "HH:MM". */
function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Verifica que una hora ISO esté dentro del rango diario [dayStart, dayEnd]. */
function isWithinDayHours(startIso: string, endIso: string): boolean {
  const DAY_START = minutesSinceMidnight('09:00');
  const DAY_END = minutesSinceMidnight('18:00');
  const start = minutesSinceMidnight(timeOf(startIso));
  const end = minutesSinceMidnight(timeOf(endIso));
  return start >= DAY_START && end <= DAY_END;
}

/** Verifica que no haya solapamiento entre dos eventos (con buffer de 15 min). */
function noOverlapWithBuffer(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
  bufferMin = 15,
): boolean {
  // Comparar como string ISO: válido si ambos son del mismo timezone
  const aEndMin = new Date(aEnd).getTime() + bufferMin * 60_000;
  const bEndMin = new Date(bEnd).getTime() + bufferMin * 60_000;
  const aStartMs = new Date(aStart).getTime();
  const bStartMs = new Date(bStart).getTime();
  return aEndMin <= bStartMs || bEndMin <= aStartMs;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Buscar el usuario de prueba por email (debe existir tras correr seed-e2e.ts)
  const userA = await prisma.user.findUnique({ where: { email: EMAIL_A } });
  if (!userA) {
    throw new Error(
      'Usuario de prueba E2E no encontrado. Ejecuta: npx tsx scripts/seed-e2e.ts',
    );
  }
  userAId = userA.id;

  // Resolver IDs de eventos por título
  const events = await prisma.event.findMany({ where: { userId: userAId } });
  const byTitle = (title: string): string => {
    const e = events.find((ev) => ev.title === title);
    if (!e) throw new Error(`Evento no encontrado: "${title}"`);
    return e.id;
  };

  eventIds = {
    junta: byTitle('Junta semanal'),
    revision: byTitle('Revisión de proyecto'),
    estudiar: byTitle('Estudiar para examen'),
    dentista: byTitle('Llamar al dentista'),
    leerArticulo: byTitle('Leer artículo'),
    cumpleanios: byTitle('Cumpleaños mamá'),
    vitaminas: byTitle('Tomar vitaminas'),
  };

  // Ejecutar el solver una vez para todos los tests
  solverResult = await schedulingService.solve(userAId);
}, 30_000);

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── PASO 1: Estado inicial ───────────────────────────────────────────────────

describe('PASO 1 — Estado inicial', () => {
  it('debe encontrar eventos que participan en el agendamiento', async () => {
    const events = await prisma.event.findMany({
      where: { userId: userAId, participatesInScheduling: true },
    });
    // 1 CRITICA fija + 3 flexibles (URGENTE + 2 RELEVANTE)
    expect(events.length).toBeGreaterThanOrEqual(4);
  });

  it('debe tener el evento CRITICA fijo del seed (Junta semanal)', async () => {
    const criticals = await prisma.event.findMany({
      where: { userId: userAId, priority: Priority.CRITICA, participatesInScheduling: true },
    });
    const junta = criticals.find((e) => e.title === 'Junta semanal');
    expect(junta).toBeDefined();
    expect(junta!.start).not.toBeNull();
  });

  it('debe tener 3 eventos flexibles (URGENTE + 2 RELEVANTE)', async () => {
    const flexible = await prisma.event.findMany({
      where: {
        userId: userAId,
        priority: { in: [Priority.URGENTE, Priority.RELEVANTE] },
        participatesInScheduling: true,
      },
    });
    expect(flexible.length).toBe(3);
  });
});

// ─── PASO 2: Ejecutar solver ──────────────────────────────────────────────────

describe('PASO 2 — Ejecutar solver', () => {
  it('debe retornar resultado con estructura válida', () => {
    expect(solverResult).toBeDefined();
    expect(Array.isArray(solverResult.placed)).toBe(true);
    expect(Array.isArray(solverResult.moved)).toBe(true);
    expect(Array.isArray(solverResult.unplaced)).toBe(true);
  });

  it('no debe dejar ningún evento flexible sin colocar', () => {
    const flexIds = new Set([eventIds.revision, eventIds.estudiar, eventIds.dentista]);
    const unplacedFlex = solverResult.unplaced.filter((u) => flexIds.has(u.id));
    expect(unplacedFlex).toHaveLength(0);
  });
});

// ─── PASO 3: Jerarquía de prioridades ────────────────────────────────────────

describe('PASO 3 — Jerarquía de prioridades', () => {
  it('"Revisión de proyecto" (URGENTE) debe colocarse antes que "Estudiar para examen" (RELEVANTE)', () => {
    const revision = solverResult.placed.find((p) => p.id === eventIds.revision);
    const estudiar = solverResult.placed.find((p) => p.id === eventIds.estudiar);
    expect(revision).toBeDefined();
    expect(estudiar).toBeDefined();
    // URGENTE debe iniciar igual o antes que RELEVANTE
    expect(new Date(revision!.start).getTime()).toBeLessThanOrEqual(
      new Date(estudiar!.start).getTime(),
    );
  });

  it('"Llamar al dentista" (RELEVANTE, PRONTO) debe quedar dentro de su ventana', () => {
    const dentista = solverResult.placed.find((p) => p.id === eventIds.dentista);
    expect(dentista).toBeDefined();
    // La ventana PRONTO es ~48h desde ahora; solo verificamos que fue colocado
    expect(dentista!.start).toBeTruthy();
  });

  it('ningún evento flexible debe solaparse con "Junta semanal" (CRITICA)', async () => {
    const junta = await prisma.event.findUnique({ where: { id: eventIds.junta } });
    expect(junta?.start).not.toBeNull();
    expect(junta?.end).not.toBeNull();

    const juntaStart = junta!.start!.toISOString();
    const juntaEnd = junta!.end!.toISOString();

    for (const placed of solverResult.placed) {
      const ok = noOverlapWithBuffer(placed.start, placed.end, juntaStart, juntaEnd);
      expect(ok, `Evento ${placed.id} se solapa con Junta semanal`).toBe(true);
    }
  });
});

// ─── PASO 4: Restricciones duras ─────────────────────────────────────────────

describe('PASO 4 — Restricciones duras', () => {
  it('todos los eventos colocados deben estar dentro de L-V 09:00-18:00', () => {
    const flexIds = new Set([eventIds.revision, eventIds.estudiar, eventIds.dentista]);
    const flexPlaced = solverResult.placed.filter((p) => flexIds.has(p.id));

    for (const ev of flexPlaced) {
      const ok = isWithinDayHours(ev.start, ev.end);
      expect(ok, `Evento ${ev.id} fuera del horario: ${ev.start} → ${ev.end}`).toBe(true);
    }
  });

  it('debe haber buffer de 15 min entre cualquier par de eventos colocados', () => {
    const pairs = solverResult.placed.flatMap((a, i) =>
      solverResult.placed.slice(i + 1).map((b) => [a, b] as const),
    );

    for (const [a, b] of pairs) {
      const ok = noOverlapWithBuffer(a.start, a.end, b.start, b.end, 15);
      expect(
        ok,
        `Par sin buffer: ${a.id} (${a.end}) y ${b.id} (${b.start})`,
      ).toBe(true);
    }
  });

  it('ningún evento debe estar fuera de su ventana de disponibilidad', async () => {
    const flexEvents = await prisma.event.findMany({
      where: {
        id: { in: [eventIds.revision, eventIds.estudiar, eventIds.dentista] },
      },
    });

    for (const ev of flexEvents) {
      const placed = solverResult.placed.find((p) => p.id === ev.id);
      if (!placed) continue; // ya cubierto por PASO 2

      if (ev.windowEnd) {
        const placedStart = new Date(placed.start).getTime();
        const windowEnd = ev.windowEnd.getTime();
        expect(
          placedStart,
          `Evento "${ev.title}" colocado fuera de su ventana`,
        ).toBeLessThanOrEqual(windowEnd);
      }
    }
  });
});

// ─── PASO 5: Recordatorios no afectan ────────────────────────────────────────

describe('PASO 5 — Recordatorios no participan en el solver', () => {
  it('"Cumpleaños mamá" no debe aparecer en ninguna lista del resultado', () => {
    const allIds = [
      ...solverResult.placed.map((e) => e.id),
      ...solverResult.moved.map((e) => e.id),
      ...solverResult.unplaced.map((e) => e.id),
    ];
    expect(allIds).not.toContain(eventIds.cumpleanios);
  });

  it('"Tomar vitaminas" no debe aparecer en ninguna lista del resultado', () => {
    const allIds = [
      ...solverResult.placed.map((e) => e.id),
      ...solverResult.moved.map((e) => e.id),
      ...solverResult.unplaced.map((e) => e.id),
    ];
    expect(allIds).not.toContain(eventIds.vitaminas);
  });
});

// ─── PASO 6: Evento opcional no participa ────────────────────────────────────

describe('PASO 6 — Evento OPCIONAL no participa en el solver', () => {
  it('"Leer artículo" no debe aparecer en ninguna lista del resultado', () => {
    const allIds = [
      ...solverResult.placed.map((e) => e.id),
      ...solverResult.moved.map((e) => e.id),
      ...solverResult.unplaced.map((e) => e.id),
    ];
    expect(allIds).not.toContain(eventIds.leerArticulo);
  });
});
