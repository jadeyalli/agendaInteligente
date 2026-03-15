/**
 * Tests del módulo colaborativo.
 * Cobertura: los 10 escenarios obligatorios especificados en INSTRUCCIONES_FASE_4_5.md.
 * Se usan mocks de repositorios y SchedulingService para aislar la lógica de negocio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de dependencias ────────────────────────────────────────────────────

vi.mock('@/repositories/collaborative.repo', () => ({
  collaborativeRepository: {
    createWithSlotsAndParticipants: vi.fn(),
    findByIdWithRelations: vi.fn(),
    updateStatus: vi.fn(),
    confirmSlot: vi.fn(),
    registerVote: vi.fn(),
    updateParticipantStatus: vi.fn(),
    findParticipant: vi.fn(),
    findActivePhantomBlocks: vi.fn(),
    deactivatePhantomBlocks: vi.fn(),
    deactivateAllPhantomBlocks: vi.fn(),
    createPhantomBlocksForUser: vi.fn(),
    createRescheduleRequest: vi.fn(),
    updateRequestStatus: vi.fn(),
    createSlotsForNewRound: vi.fn(),
    resetParticipantVotes: vi.fn(),
    findHostedByUser: vi.fn(),
    findInvitedForUser: vi.fn(),
  },
}));

vi.mock('@/repositories/events.repo', () => ({
  eventRepository: {
    create: vi.fn(),
    convertToReminder: vi.fn(),
    updateFixed: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/repositories/settings.repo', () => ({
  settingsRepository: {
    findByUserId: vi.fn().mockResolvedValue({ timezone: 'America/Mexico_City' }),
  },
}));

vi.mock('@/services/scheduling', () => ({
  SchedulingService: vi.fn().mockImplementation(() => ({
    solve: vi.fn().mockResolvedValue({ placed: [], moved: [], unplaced: [], score: null }),
  })),
}));

import { collaborativeRepository } from '@/repositories/collaborative.repo';
import { eventRepository } from '@/repositories/events.repo';
import { CollaborativeService } from './collaborative';

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const HOST_ID = 'host-001';
const GUEST_A = 'guest-001'; // ESSENTIAL
const GUEST_B = 'guest-002'; // REGULAR
const COLLAB_ID = 'collab-001';

const SLOT_1 = { start: '2026-03-20T09:00:00', end: '2026-03-20T10:00:00' };
const SLOT_2 = { start: '2026-03-21T09:00:00', end: '2026-03-21T10:00:00' };
const SLOT_3 = { start: '2026-03-22T09:00:00', end: '2026-03-22T10:00:00' };

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: COLLAB_ID,
    hostUserId: HOST_ID,
    title: 'Reunión de equipo',
    description: null,
    durationMin: 60,
    status: 'DRAFT',
    confirmedSlot: null,
    hostTimezone: 'America/Mexico_City',
    createdAt: new Date(),
    updatedAt: new Date(),
    slots: [
      { id: 'slot-1', collabEventId: COLLAB_ID, proposedBy: HOST_ID, start: new Date(SLOT_1.start), end: new Date(SLOT_1.end), votes: 0, isConfirmed: false, round: 1, phantomBlockId: null },
      { id: 'slot-2', collabEventId: COLLAB_ID, proposedBy: HOST_ID, start: new Date(SLOT_2.start), end: new Date(SLOT_2.end), votes: 2, isConfirmed: false, round: 1, phantomBlockId: null },
      { id: 'slot-3', collabEventId: COLLAB_ID, proposedBy: HOST_ID, start: new Date(SLOT_3.start), end: new Date(SLOT_3.end), votes: 1, isConfirmed: false, round: 1, phantomBlockId: null },
    ],
    participants: [
      { id: 'part-host', collabEventId: COLLAB_ID, userId: HOST_ID, role: 'HOST', status: 'VOTED', votedSlotId: null, localEventId: null, timezone: 'America/Mexico_City' },
      { id: 'part-a', collabEventId: COLLAB_ID, userId: GUEST_A, role: 'ESSENTIAL', status: 'PENDING', votedSlotId: null, localEventId: null, timezone: 'America/New_York' },
      { id: 'part-b', collabEventId: COLLAB_ID, userId: GUEST_B, role: 'REGULAR', status: 'PENDING', votedSlotId: null, localEventId: null, timezone: 'America/New_York' },
    ],
    requests: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CollaborativeService', () => {
  let service: CollaborativeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CollaborativeService();
  });

  // ─── Escenario 1: Creación válida ──────────────────────────────────────────

  describe('create', () => {
    it('crea evento con 3 slots, participantes y bloques fantasma', async () => {
      vi.mocked(collaborativeRepository.createWithSlotsAndParticipants).mockResolvedValue(
        makeEvent() as never,
      );

      const id = await service.create(HOST_ID, {
        title: 'Reunión',
        durationMin: 60,
        hostTimezone: 'America/Mexico_City',
        proposedSlots: [SLOT_1, SLOT_2, SLOT_3],
        participants: [
          { userId: GUEST_A, role: 'ESSENTIAL' },
          { userId: GUEST_B, role: 'REGULAR' },
        ],
      });

      expect(id).toBe(COLLAB_ID);
      expect(collaborativeRepository.createWithSlotsAndParticipants).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(collaborativeRepository.createWithSlotsAndParticipants).mock.calls[0][0];
      expect(callArgs.slots).toHaveLength(3);
      expect(callArgs.participants).toHaveLength(2);
    });
  });

  // ─── Escenario 2: Validación de slots ─────────────────────────────────────

  describe('validaciones de create', () => {
    it('falla si hay menos de 3 slots', async () => {
      await expect(
        service.create(HOST_ID, {
          title: 'X',
          durationMin: 60,
          hostTimezone: 'America/Mexico_City',
          proposedSlots: [SLOT_1, SLOT_2],
          participants: [{ userId: GUEST_A, role: 'ESSENTIAL' }],
        }),
      ).rejects.toThrow('exactamente 3 slots');
    });

    it('falla si un slot tiene duración incorrecta', async () => {
      const slotMalo = { start: '2026-03-20T09:00:00', end: '2026-03-20T09:30:00' }; // 30 min, no 60
      await expect(
        service.create(HOST_ID, {
          title: 'X',
          durationMin: 60,
          hostTimezone: 'America/Mexico_City',
          proposedSlots: [SLOT_1, SLOT_2, slotMalo],
          participants: [{ userId: GUEST_A, role: 'ESSENTIAL' }],
        }),
      ).rejects.toThrow('60 minutos');
    });

    it('falla si no hay participantes', async () => {
      await expect(
        service.create(HOST_ID, {
          title: 'X',
          durationMin: 60,
          hostTimezone: 'America/Mexico_City',
          proposedSlots: [SLOT_1, SLOT_2, SLOT_3],
          participants: [],
        }),
      ).rejects.toThrow('al menos 1 participante');
    });
  });

  // ─── Escenario 3: Flujo de votación ───────────────────────────────────────

  describe('vote', () => {
    it('registra voto correctamente cuando la votación está abierta', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never, // GUEST_A, PENDING
      );
      vi.mocked(collaborativeRepository.registerVote).mockResolvedValue(undefined);

      await service.vote(COLLAB_ID, GUEST_A, 'slot-2');

      expect(collaborativeRepository.registerVote).toHaveBeenCalledWith('part-a', 'slot-2');
    });

    it('rechaza voto duplicado (ya votó)', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        { ...event.participants[1], status: 'VOTED' } as never,
      );

      await expect(service.vote(COLLAB_ID, GUEST_A, 'slot-2')).rejects.toThrow('Ya votaste');
    });

    it('rechaza voto si el evento no está en VOTING', async () => {
      const event = makeEvent({ status: 'CONFIRMED' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never,
      );

      await expect(service.vote(COLLAB_ID, GUEST_A, 'slot-1')).rejects.toThrow('votación no está abierta');
    });
  });

  // ─── Escenario 4: Confirmación de slot ────────────────────────────────────

  describe('confirmSlot', () => {
    it('confirma slot, desactiva fantasmas y crea evento en agenda del anfitrión', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.confirmSlot).mockResolvedValue(undefined);
      vi.mocked(collaborativeRepository.deactivatePhantomBlocks).mockResolvedValue(undefined);
      vi.mocked(collaborativeRepository.updateParticipantStatus).mockResolvedValue(undefined);
      vi.mocked(eventRepository.create).mockResolvedValue({ id: 'evt-host-001' } as never);

      await service.confirmSlot(COLLAB_ID, HOST_ID, 'slot-2');

      expect(collaborativeRepository.confirmSlot).toHaveBeenCalledWith(COLLAB_ID, 'slot-2', expect.any(Date));
      expect(collaborativeRepository.deactivatePhantomBlocks).toHaveBeenCalledWith(COLLAB_ID, HOST_ID);
      expect(eventRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: HOST_ID,
        priority: 'CRITICA',
        isFixed: true,
      }));
    });

    it('rechaza si el confirmador no es el anfitrión', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);

      await expect(service.confirmSlot(COLLAB_ID, GUEST_A, 'slot-1')).rejects.toThrow('Solo el anfitrión');
    });
  });

  // ─── Escenario 5: Aceptación ──────────────────────────────────────────────

  describe('acceptConfirmedSlot', () => {
    it('crea evento fijo en agenda del invitado y retorna schedulingChanges', async () => {
      const confirmedSlot = { id: 'slot-2', isConfirmed: true, start: new Date(SLOT_2.start), end: new Date(SLOT_2.end), votes: 2, round: 1, collabEventId: COLLAB_ID, proposedBy: HOST_ID, phantomBlockId: null };
      const event = makeEvent({ status: 'CONFIRMED', slots: [confirmedSlot] });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never, // GUEST_A, PENDING
      );
      vi.mocked(eventRepository.create).mockResolvedValue({ id: 'evt-guest-001' } as never);
      vi.mocked(collaborativeRepository.updateParticipantStatus).mockResolvedValue(undefined);

      const result = await service.acceptConfirmedSlot(COLLAB_ID, GUEST_A);

      expect(result.success).toBe(true);
      expect(eventRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: GUEST_A,
        priority: 'CRITICA',
        isFixed: true,
      }));
      expect(collaborativeRepository.updateParticipantStatus).toHaveBeenCalledWith(
        'part-a', 'ACCEPTED', 'evt-guest-001',
      );
    });

    it('rechaza si el invitado ya aceptó', async () => {
      const event = makeEvent({ status: 'CONFIRMED' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        { ...event.participants[1], status: 'ACCEPTED' } as never,
      );

      await expect(service.acceptConfirmedSlot(COLLAB_ID, GUEST_A)).rejects.toThrow('Ya aceptaste');
    });
  });

  // ─── Escenario 6: Rechazo ─────────────────────────────────────────────────

  describe('declineConfirmedSlot', () => {
    it('crea recordatorio en agenda del invitado y actualiza estado a DECLINED', async () => {
      const confirmedSlot = { id: 'slot-2', isConfirmed: true, start: new Date(SLOT_2.start), end: new Date(SLOT_2.end), votes: 2, round: 1, collabEventId: COLLAB_ID, proposedBy: HOST_ID, phantomBlockId: null };
      const event = makeEvent({ status: 'CONFIRMED', slots: [confirmedSlot] });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never,
      );
      vi.mocked(eventRepository.create).mockResolvedValue({ id: 'evt-reminder-001' } as never);
      vi.mocked(collaborativeRepository.updateParticipantStatus).mockResolvedValue(undefined);

      await service.declineConfirmedSlot(COLLAB_ID, GUEST_A);

      expect(eventRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        priority: 'RECORDATORIO',
        canOverlap: true,
      }));
      expect(collaborativeRepository.updateParticipantStatus).toHaveBeenCalledWith(
        'part-a', 'DECLINED', 'evt-reminder-001',
      );
    });
  });

  // ─── Escenario 7: Solicitud de reagendamiento ─────────────────────────────

  describe('requestReschedule', () => {
    it('solo ESSENTIAL puede solicitar reagendamiento', async () => {
      const event = makeEvent({ status: 'CONFIRMED' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[2] as never, // GUEST_B, REGULAR
      );

      await expect(
        service.requestReschedule(COLLAB_ID, GUEST_B, {
          proposedSlots: [SLOT_1, SLOT_2, SLOT_3],
        }),
      ).rejects.toThrow('Solo invitados indispensables');
    });

    it('crea solicitud y bloques fantasma para ESSENTIAL', async () => {
      const event = makeEvent({ status: 'CONFIRMED' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never, // GUEST_A, ESSENTIAL
      );
      vi.mocked(collaborativeRepository.createSlotsForNewRound).mockResolvedValue(undefined);
      vi.mocked(collaborativeRepository.createRescheduleRequest).mockResolvedValue(
        { id: 'req-001', collabEventId: COLLAB_ID, requestedBy: GUEST_A, status: 'PENDING', createdAt: new Date() } as never,
      );
      vi.mocked(collaborativeRepository.createPhantomBlocksForUser).mockResolvedValue(undefined);

      const requestId = await service.requestReschedule(COLLAB_ID, GUEST_A, {
        proposedSlots: [SLOT_1, SLOT_2, SLOT_3],
      });

      expect(requestId).toBe('req-001');
      expect(collaborativeRepository.createSlotsForNewRound).toHaveBeenCalledWith(
        COLLAB_ID, GUEST_A, expect.arrayContaining([expect.objectContaining({ start: expect.any(Date) })]), 2,
      );
      expect(collaborativeRepository.createPhantomBlocksForUser).toHaveBeenCalledWith(
        GUEST_A, COLLAB_ID, expect.arrayContaining([expect.objectContaining({ start: expect.any(Date) })]),
      );
    });
  });

  // ─── Escenario 8: Aprobación de reagendamiento ────────────────────────────

  describe('approveRescheduleRequest', () => {
    it('pasa a RENEGOTIATING y resetea votos de participantes', async () => {
      const event = makeEvent({
        status: 'CONFIRMED',
        requests: [{ id: 'req-001', collabEventId: COLLAB_ID, requestedBy: GUEST_A, status: 'PENDING', createdAt: new Date() }],
      });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.updateRequestStatus).mockResolvedValue(undefined);
      vi.mocked(collaborativeRepository.updateStatus).mockResolvedValue(undefined);
      vi.mocked(collaborativeRepository.resetParticipantVotes).mockResolvedValue(undefined);

      await service.approveRescheduleRequest(COLLAB_ID, HOST_ID, 'req-001');

      expect(collaborativeRepository.updateStatus).toHaveBeenCalledWith(COLLAB_ID, 'RENEGOTIATING');
      expect(collaborativeRepository.resetParticipantVotes).toHaveBeenCalledWith(COLLAB_ID);
    });
  });

  // ─── Escenario 9: Control exclusivo del anfitrión ─────────────────────────

  describe('permisos del anfitrión', () => {
    it('invitado no puede confirmar slot', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);

      await expect(service.confirmSlot(COLLAB_ID, GUEST_A, 'slot-1')).rejects.toThrow('Solo el anfitrión');
    });

    it('invitado no puede cancelar el evento', async () => {
      const event = makeEvent({ status: 'CONFIRMED' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);

      await expect(service.cancelEvent(COLLAB_ID, GUEST_A)).rejects.toThrow('Solo el anfitrión');
    });

    it('invitado no puede aprobar solicitudes de reagendamiento', async () => {
      const event = makeEvent({
        status: 'CONFIRMED',
        requests: [{ id: 'req-001', collabEventId: COLLAB_ID, requestedBy: GUEST_A, status: 'PENDING', createdAt: new Date() }],
      });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);

      await expect(
        service.approveRescheduleRequest(COLLAB_ID, GUEST_A, 'req-001'),
      ).rejects.toThrow('Solo el anfitrión');
    });
  });

  // ─── Escenario 10: Traductor de zonas horarias ────────────────────────────
  // (Los tests de translateTimezone están en timezone-translator.test.ts)
  // Aquí verificamos que la invitación usa la zona correcta del invitado.

  describe('getInvitation', () => {
    it('retorna slots traducidos a la zona del invitado', async () => {
      const event = makeEvent({ status: 'VOTING' });
      vi.mocked(collaborativeRepository.findByIdWithRelations).mockResolvedValue(event as never);
      vi.mocked(collaborativeRepository.findParticipant).mockResolvedValue(
        event.participants[1] as never, // GUEST_A, New York
      );

      const invitation = await service.getInvitation(COLLAB_ID, GUEST_A);

      expect(invitation.slots).toHaveLength(3);
      expect(invitation.slots[0].localTimezone).toBe('America/New_York');
      expect(invitation.slots[0].hostTimezone).toBe('America/Mexico_City');
      // startHostTz y startLocalTz no deben ser iguales (diferentes zonas)
      expect(invitation.slots[0].startHostTz).not.toBe(invitation.slots[0].startLocalTz);
    });
  });
});
