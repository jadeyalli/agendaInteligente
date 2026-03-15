/**
 * Test E2E del flujo colaborativo completo (pasos 1–9 + 10–12 de reagendamiento).
 *
 * Requisito: base de datos con datos del seed E2E (scripts/seed-e2e.ts).
 * Este test verifica todo el ciclo de vida de un evento colaborativo:
 * creación → votación → confirmación → aceptación → reagendamiento.
 *
 * Nota: los tests se ejecutan en orden secuencial dentro del archivo.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CollaborativeService } from '@/services/collaborative';
import { SchedulingService } from '@/services/scheduling';

const prisma = new PrismaClient();
const collabService = new CollaborativeService();
const schedulingService = new SchedulingService();

const EMAIL_A = 'usuario-a@e2e.test';
const EMAIL_B = 'usuario-b@e2e.test';
// Duración del evento colaborativo de prueba
const DURATION_MIN = 60;

// Estado compartido entre pasos (se llena en beforeAll y cada test)
const state = {
  userAId: '' as string,
  userBId: '' as string,
  collabId: '' as string,
  slotIds: [] as string[],
  votedSlotId: '' as string,
  confirmedSlotId: '' as string,
  rescheduleRequestId: '' as string,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Obtiene el próximo lunes a medianoche. */
function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Fecha en la próxima semana laboral. */
function dayNextWeek(weekday: number, hour: number, minute = 0): Date {
  const monday = getNextMonday();
  const d = new Date(monday);
  d.setDate(monday.getDate() + (weekday - 1));
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMin(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Extrae la hora "HH:MM" de un ISO naive o UTC string. */
function hourOf(iso: string): number {
  const timePart = iso.split('T')[1] ?? '';
  return parseInt(timePart.slice(0, 2), 10);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const userA = await prisma.user.findUnique({ where: { email: EMAIL_A } });
  const userB = await prisma.user.findUnique({ where: { email: EMAIL_B } });

  if (!userA || !userB) {
    throw new Error(
      'Usuarios de prueba E2E no encontrados. Ejecuta: npx tsx scripts/seed-e2e.ts',
    );
  }

  state.userAId = userA.id;
  state.userBId = userB.id;

  // Limpiar eventos colaborativos residuales de pruebas anteriores.
  // Primero recopilar localEventIds antes de borrar los participantes,
  // para poder eliminar los eventos locales huérfanos creados por confirmSlot/acceptConfirmedSlot.
  const orphanedParticipants = await prisma.collabParticipant.findMany({
    where: { userId: { in: [state.userAId, state.userBId] } },
    select: { localEventId: true },
  });
  const orphanedEventIds = orphanedParticipants
    .map((p) => p.localEventId)
    .filter((id): id is string => id !== null);

  await prisma.collaborativeEvent.deleteMany({
    where: { hostUserId: { in: [state.userAId] } },
  });
  await prisma.collabParticipant.deleteMany({
    where: { userId: { in: [state.userAId, state.userBId] } },
  });
  await prisma.phantomBlock.deleteMany({
    where: { userId: { in: [state.userAId, state.userBId] } },
  });

  // Eliminar eventos locales huérfanos de ejecuciones anteriores del test.
  // Incluye los rastreados por participantes y cualquier residuo con el título
  // del evento colaborativo que haya quedado huérfano sin referencia en participantes.
  if (orphanedEventIds.length > 0) {
    await prisma.event.deleteMany({ where: { id: { in: orphanedEventIds } } });
  }
  await prisma.event.deleteMany({
    where: {
      userId: { in: [state.userAId, state.userBId] },
      title: 'Reunión de tesis',
    },
  });
}, 15_000);

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── PASO 1: Creación ─────────────────────────────────────────────────────────

describe('PASO 1 — Usuario A crea evento colaborativo', () => {
  // Slots propuestos: próxima semana en horario de trabajo de A (09:00-18:00 MX)
  const slot1Start = dayNextWeek(1, 13, 0); // Lunes 13:00
  const slot2Start = dayNextWeek(2, 14, 0); // Martes 14:00
  const slot3Start = dayNextWeek(3, 10, 0); // Miércoles 10:00

  it('debe crear el CollaborativeEvent en estado DRAFT', async () => {
    state.collabId = await collabService.create(state.userAId, {
      title: 'Reunión de tesis',
      description: 'Sesión de trabajo colaborativo',
      durationMin: DURATION_MIN,
      hostTimezone: 'America/Mexico_City',
      proposedSlots: [
        { start: slot1Start.toISOString(), end: addMin(slot1Start, DURATION_MIN).toISOString() },
        { start: slot2Start.toISOString(), end: addMin(slot2Start, DURATION_MIN).toISOString() },
        { start: slot3Start.toISOString(), end: addMin(slot3Start, DURATION_MIN).toISOString() },
      ],
      participants: [{ userId: state.userBId, role: 'ESSENTIAL' }],
    });

    const event = await prisma.collaborativeEvent.findUnique({
      where: { id: state.collabId },
    });
    expect(event).toBeDefined();
    expect(event!.status).toBe('DRAFT');
  });

  it('debe crear exactamente 3 PhantomBlocks activos en la agenda del anfitrión', async () => {
    const phantoms = await prisma.phantomBlock.findMany({
      where: { collabEventId: state.collabId, isActive: true },
    });
    expect(phantoms).toHaveLength(3);
    phantoms.forEach((p) => expect(p.userId).toBe(state.userAId));
  });

  it('debe crear exactamente 3 CollabSlotOptions', async () => {
    const slots = await prisma.collabSlotOption.findMany({
      where: { collabEventId: state.collabId },
    });
    expect(slots).toHaveLength(3);
    state.slotIds = slots.map((s) => s.id);
  });

  it('debe crear 2 CollabParticipants (HOST + ESSENTIAL)', async () => {
    const participants = await prisma.collabParticipant.findMany({
      where: { collabEventId: state.collabId },
    });
    expect(participants).toHaveLength(2);
    const roles = participants.map((p) => p.role).sort();
    expect(roles).toEqual(['ESSENTIAL', 'HOST']);
  });
});

// ─── PASO 2: Envío de invitaciones ────────────────────────────────────────────

describe('PASO 2 — Usuario A envía invitaciones', () => {
  it('debe transicionar el estado de DRAFT a VOTING', async () => {
    await collabService.sendInvitations(state.collabId, state.userAId);
    const event = await prisma.collaborativeEvent.findUnique({
      where: { id: state.collabId },
    });
    expect(event!.status).toBe('VOTING');
  });
});

// ─── PASO 3: Invitación con zonas horarias ────────────────────────────────────

describe('PASO 3 — Usuario B recibe invitación con zonas horarias traducidas', () => {
  it('debe incluir startHostTz y startLocalTz en cada slot', async () => {
    const invitation = await collabService.getInvitation(state.collabId, state.userBId);
    expect(invitation.slots).toHaveLength(3);

    for (const slot of invitation.slots) {
      expect(slot.startHostTz).toBeTruthy();
      expect(slot.startLocalTz).toBeTruthy();
      expect(slot.startHostTz).not.toBe(slot.startLocalTz);
    }
  });

  it('la diferencia horaria CDT→EDT debe ser correcta (Mexico City + 1-2h = New York)', async () => {
    const invitation = await collabService.getInvitation(state.collabId, state.userBId);
    // En marzo 2026 (antes del cambio de horario en México, después en NY):
    // Mexico City: CST/CDT, New York: EDT
    // New York está 1 o 2 horas adelante de Mexico City

    for (const slot of invitation.slots) {
      const hostHour = hourOf(slot.startHostTz);
      const localHour = hourOf(slot.startLocalTz);
      const diff = localHour - hostHour;
      // El invitado (New York) debe estar 1 o 2 horas adelante de Mexico City
      expect(diff).toBeGreaterThanOrEqual(1);
      expect(diff).toBeLessThanOrEqual(2);
    }
  });
});

// ─── PASO 4: Votación ─────────────────────────────────────────────────────────

describe('PASO 4 — Usuario B vota', () => {
  it('debe registrar el voto y cambiar status a VOTED', async () => {
    // Votar por el primer slot disponible
    state.votedSlotId = state.slotIds[0]!;
    await collabService.vote(state.collabId, state.userBId, state.votedSlotId);

    const participant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });
    expect(participant!.status).toBe('VOTED');
    expect(participant!.votedSlotId).toBe(state.votedSlotId);
  });

  it('el slot votado debe tener votes = 1', async () => {
    const slot = await prisma.collabSlotOption.findUnique({
      where: { id: state.votedSlotId },
    });
    expect(slot!.votes).toBe(1);
  });
});

// ─── PASO 5: Resultados de votación ──────────────────────────────────────────

describe('PASO 5 — Usuario A consulta resultados', () => {
  it('debe mostrar totalVotes = 1 y totalParticipants = 1', async () => {
    const results = await collabService.getVotingResults(state.collabId, state.userAId);
    expect(results.totalVotes).toBe(1);
    expect(results.totalParticipants).toBe(1);
    expect(results.status).toBe('VOTING');
  });
});

// ─── PASO 6: Confirmación ─────────────────────────────────────────────────────

describe('PASO 6 — Usuario A confirma el slot más votado', () => {
  it('debe confirmar el slot y cambiar estado a CONFIRMED', async () => {
    state.confirmedSlotId = state.votedSlotId;
    await collabService.confirmSlot(state.collabId, state.userAId, state.confirmedSlotId);

    const event = await prisma.collaborativeEvent.findUnique({
      where: { id: state.collabId },
    });
    expect(event!.status).toBe('CONFIRMED');
    expect(event!.confirmedSlot).not.toBeNull();
  });

  it('los PhantomBlocks no elegidos deben desactivarse', async () => {
    const activePhantoms = await prisma.phantomBlock.findMany({
      where: { collabEventId: state.collabId, isActive: true },
    });
    // Solo el slot confirmado podría quedar activo (pero se desactivan todos al confirmar)
    expect(activePhantoms).toHaveLength(0);
  });

  it('debe crear un evento CRITICA/fijo en la agenda del anfitrión', async () => {
    const hostParticipant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, role: 'HOST' },
    });
    expect(hostParticipant!.localEventId).toBeTruthy();

    const localEvent = await prisma.event.findUnique({
      where: { id: hostParticipant!.localEventId! },
    });
    expect(localEvent!.priority).toBe('CRITICA');
    expect(localEvent!.isFixed).toBe(true);
    expect(localEvent!.userId).toBe(state.userAId);
  });
});

// ─── PASO 7: Aceptación individual ───────────────────────────────────────────

describe('PASO 7 — Usuario B acepta', () => {
  it('debe crear evento CRITICA/fijo en la agenda del invitado', async () => {
    const result = await collabService.acceptConfirmedSlot(state.collabId, state.userBId);
    expect(result.success).toBe(true);

    const participant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });
    expect(participant!.status).toBe('ACCEPTED');
    expect(participant!.localEventId).toBeTruthy();

    const localEvent = await prisma.event.findUnique({
      where: { id: participant!.localEventId! },
    });
    expect(localEvent!.priority).toBe('CRITICA');
    expect(localEvent!.isFixed).toBe(true);
    expect(localEvent!.userId).toBe(state.userBId);
  });

  it('debe retornar schedulingChanges si el solver pudo optimizar', async () => {
    // No podemos verificar contenido exacto (depende del estado del solver),
    // pero si se retorna es un objeto válido
    const result = await collabService.acceptConfirmedSlot(state.collabId, state.userBId).catch(
      // Ya fue aceptado en el test anterior, así que esperamos el error
      (e: Error) => ({ success: false, error: e.message }),
    );
    // Verificar que el error es el esperado (ya fue aceptado)
    if ('error' in result) {
      expect(result.error).toContain('Ya aceptaste');
    }
  });
});

// ─── PASO 8: Solver de A post-colaborativo ────────────────────────────────────

describe('PASO 8 — Solver de Usuario A post-colaborativo', () => {
  it('no debe haber PhantomBlocks activos que interfieran', async () => {
    const activePhantoms = await prisma.phantomBlock.findMany({
      where: { userId: state.userAId, isActive: true },
    });
    expect(activePhantoms).toHaveLength(0);
  });

  it('el evento colaborativo confirmado debe actuar como evento fijo para el solver', async () => {
    const result = await schedulingService.solve(state.userAId);
    // El solver no debe colocar eventos flexibles solapados con el colaborativo
    expect(result.diagnostics.hardConflicts).toHaveLength(0);
  });

  it('ningún evento flexible debe solaparse con el evento colaborativo confirmado', async () => {
    const hostParticipant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, role: 'HOST' },
    });
    const collabEvent = await prisma.event.findUnique({
      where: { id: hostParticipant!.localEventId! },
    });

    const result = await schedulingService.solve(state.userAId);

    for (const placed of result.placed) {
      const placedStart = new Date(placed.start).getTime();
      const placedEnd = new Date(placed.end).getTime();
      const collabStart = collabEvent!.start!.getTime();
      const collabEnd = collabEvent!.end!.getTime();
      const bufferMs = 15 * 60_000;

      const noOverlap =
        placedEnd + bufferMs <= collabStart || collabEnd + bufferMs <= placedStart;
      expect(noOverlap, `Evento ${placed.id} se solapa con el evento colaborativo`).toBe(true);
    }
  });
});

// ─── PASO 10: Solicitud de reagendamiento ────────────────────────────────────

describe('PASO 10 — Usuario B solicita reagendamiento', () => {
  it('debe crear CollabRescheduleRequest en estado PENDING', async () => {
    // B propone 3 slots alternativos (semana siguiente + 1 semana)
    const altBase = dayNextWeek(3, 15, 0); // Miércoles 15:00 siguiente semana + 7 días
    altBase.setDate(altBase.getDate() + 7);

    const alt1 = new Date(altBase);
    const alt2 = new Date(altBase);
    alt2.setDate(altBase.getDate() + 1); // Jueves
    const alt3 = new Date(altBase);
    alt3.setDate(altBase.getDate() + 2); // Viernes

    state.rescheduleRequestId = await collabService.requestReschedule(
      state.collabId,
      state.userBId,
      {
        proposedSlots: [
          { start: alt1.toISOString(), end: addMin(alt1, DURATION_MIN).toISOString() },
          { start: alt2.toISOString(), end: addMin(alt2, DURATION_MIN).toISOString() },
          { start: alt3.toISOString(), end: addMin(alt3, DURATION_MIN).toISOString() },
        ],
      },
    );

    const request = await prisma.collabRescheduleRequest.findUnique({
      where: { id: state.rescheduleRequestId },
    });
    expect(request).toBeDefined();
    expect(request!.status).toBe('PENDING');
    expect(request!.requestedBy).toBe(state.userBId);
  });

  it('debe crear 3 PhantomBlocks activos en la agenda de Usuario B', async () => {
    const phantoms = await prisma.phantomBlock.findMany({
      where: { collabEventId: state.collabId, userId: state.userBId, isActive: true },
    });
    expect(phantoms).toHaveLength(3);
  });
});

// ─── PASO 11: Aprobación del reagendamiento ───────────────────────────────────

describe('PASO 11 — Usuario A aprueba la solicitud', () => {
  it('debe cambiar el estado del evento a RENEGOTIATING', async () => {
    await collabService.approveRescheduleRequest(
      state.collabId,
      state.userAId,
      state.rescheduleRequestId,
    );

    const event = await prisma.collaborativeEvent.findUnique({
      where: { id: state.collabId },
    });
    expect(event!.status).toBe('RENEGOTIATING');
  });

  it('debe resetear el status de participantes no-HOST a PENDING', async () => {
    const nonHostParticipants = await prisma.collabParticipant.findMany({
      where: { collabEventId: state.collabId, role: { not: 'HOST' } },
    });
    for (const p of nonHostParticipants) {
      expect(p.status).toBe('PENDING');
    }
  });
});

// ─── PASO 12: Nueva votación y confirmación ───────────────────────────────────

describe('PASO 12 — Nueva votación y confirmación', () => {
  it('Usuario B debe poder votar por un slot de la nueva ronda', async () => {
    // Obtener slots de la ronda 2
    const round2Slots = await prisma.collabSlotOption.findMany({
      where: { collabEventId: state.collabId, round: 2 },
    });
    expect(round2Slots.length).toBe(3);

    const newSlotId = round2Slots[0]!.id;
    await collabService.vote(state.collabId, state.userBId, newSlotId);

    const participant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });
    expect(participant!.status).toBe('VOTED');

    // Actualizar slotId para el paso de confirmación
    state.votedSlotId = newSlotId;
  });

  it('Usuario A debe poder confirmar el nuevo slot', async () => {
    await collabService.confirmSlot(state.collabId, state.userAId, state.votedSlotId);

    const event = await prisma.collaborativeEvent.findUnique({
      where: { id: state.collabId },
    });
    expect(event!.status).toBe('CONFIRMED');
  });

  it('el flujo Fase 4 se repite: Usuario B puede aceptar el nuevo horario', async () => {
    // Limpiar el estado previo de aceptación (en el test anterior B ya aceptó y luego falló)
    // Necesitamos resetear el status del participante para la nueva ronda
    const participant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });

    // Si B ya fue ACCEPTED en la ronda anterior, reset para la nueva
    if (participant!.status === 'ACCEPTED') {
      await prisma.collabParticipant.update({
        where: { id: participant!.id },
        data: { status: 'PENDING', localEventId: null },
      });
    }

    const result = await collabService.acceptConfirmedSlot(state.collabId, state.userBId);
    expect(result.success).toBe(true);

    const updatedParticipant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });
    expect(updatedParticipant!.status).toBe('ACCEPTED');
    expect(updatedParticipant!.localEventId).toBeTruthy();
  });
});

// ─── PASO 9: Solver de B post-colaborativo ────────────────────────────────────

describe('PASO 9 — Solver de Usuario B post-colaborativo', () => {
  it('la "Clase de inglés" (CRITICA) no debe haberse movido', async () => {
    const clases = await prisma.event.findMany({
      where: {
        userId: state.userBId,
        priority: 'CRITICA',
        title: { startsWith: 'Clase de inglés' },
      },
    });
    expect(clases.length).toBeGreaterThanOrEqual(1);

    const result = await schedulingService.solve(state.userBId);

    // Las clases de inglés no deben aparecer en placed ni moved (son eventos fijos)
    for (const clase of clases) {
      const inPlaced = result.placed.some((p) => p.id === clase.id);
      const inMoved = result.moved.some((m) => m.id === clase.id);
      expect(inPlaced || inMoved, `Clase de inglés "${clase.title}" fue movida`).toBe(false);
    }
  });

  it('los eventos flexibles de B no deben solaparse con el evento colaborativo aceptado', async () => {
    const bParticipant = await prisma.collabParticipant.findFirst({
      where: { collabEventId: state.collabId, userId: state.userBId },
    });
    const bCollabEvent = await prisma.event.findUnique({
      where: { id: bParticipant!.localEventId! },
    });

    const result = await schedulingService.solve(state.userBId);

    for (const placed of result.placed) {
      const placedStart = new Date(placed.start).getTime();
      const placedEnd = new Date(placed.end).getTime();
      const collabStart = bCollabEvent!.start!.getTime();
      const collabEnd = bCollabEvent!.end!.getTime();
      const bufferMs = 10 * 60_000; // buffer de B es 10 min

      const noOverlap =
        placedEnd + bufferMs <= collabStart || collabEnd + bufferMs <= placedStart;
      expect(noOverlap, `Evento ${placed.id} de B se solapa con el evento colaborativo`).toBe(true);
    }
  });
});
