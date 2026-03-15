/**
 * Repositorio de eventos colaborativos.
 * Encapsula todas las queries a las tablas colaborativas de la BD.
 * Cada método realiza exactamente una operación. La lógica de negocio vive en el servicio.
 */
import { prisma } from '@/lib/prisma';

import type {
  CollaborativeEvent,
  CollabSlotOption,
  CollabParticipant,
  CollabRescheduleRequest,
  PhantomBlock,
  CollabStatus,
  ParticipantStatus,
  RequestStatus,
} from '@prisma/client';

// Tipo de retorno para findByIdWithRelations
type CollaborativeEventWithRelations = CollaborativeEvent & {
  slots: CollabSlotOption[];
  participants: CollabParticipant[];
  requests: CollabRescheduleRequest[];
};

export class CollaborativeRepository {
  // ─── CollaborativeEvent ────────────────────────────────────────────────────

  /**
   * Crea un evento colaborativo con sus slots, participantes y bloques fantasma
   * del anfitrión en una única transacción atómica.
   */
  async createWithSlotsAndParticipants(data: {
    hostUserId: string;
    title: string;
    description?: string;
    durationMin: number;
    hostTimezone: string;
    slots: Array<{ start: Date; end: Date }>;
    participants: Array<{ userId: string; role: 'ESSENTIAL' | 'REGULAR'; timezone: string }>;
  }): Promise<CollaborativeEvent> {
    return prisma.$transaction(async (tx) => {
      const event = await tx.collaborativeEvent.create({
        data: {
          hostUserId: data.hostUserId,
          title: data.title,
          description: data.description,
          durationMin: data.durationMin,
          hostTimezone: data.hostTimezone,
          status: 'DRAFT',
        },
      });

      for (const slot of data.slots) {
        await tx.collabSlotOption.create({
          data: {
            collabEventId: event.id,
            proposedBy: data.hostUserId,
            start: slot.start,
            end: slot.end,
            round: 1,
          },
        });

        // Bloque fantasma en la agenda del anfitrión
        await tx.phantomBlock.create({
          data: {
            userId: data.hostUserId,
            collabEventId: event.id,
            start: slot.start,
            end: slot.end,
            isActive: true,
          },
        });
      }

      // Participante anfitrión (ya "votó" al proponer los slots)
      await tx.collabParticipant.create({
        data: {
          collabEventId: event.id,
          userId: data.hostUserId,
          role: 'HOST',
          status: 'VOTED',
          timezone: data.hostTimezone,
        },
      });

      for (const p of data.participants) {
        await tx.collabParticipant.create({
          data: {
            collabEventId: event.id,
            userId: p.userId,
            role: p.role,
            status: 'PENDING',
            timezone: p.timezone,
          },
        });
      }

      return event;
    });
  }

  /**
   * Obtiene un evento colaborativo por ID incluyendo slots, participantes y solicitudes.
   * Retorna null si no existe.
   */
  async findByIdWithRelations(
    collabEventId: string,
  ): Promise<CollaborativeEventWithRelations | null> {
    return prisma.collaborativeEvent.findUnique({
      where: { id: collabEventId },
      include: { slots: true, participants: true, requests: true },
    });
  }

  /**
   * Actualiza el estado del evento colaborativo.
   */
  async updateStatus(collabEventId: string, status: CollabStatus): Promise<void> {
    await prisma.collaborativeEvent.update({
      where: { id: collabEventId },
      data: { status },
    });
  }

  /**
   * Marca el evento como CONFIRMED, fija el slot elegido y guarda la fecha confirmada.
   */
  async confirmSlot(
    collabEventId: string,
    slotId: string,
    confirmedStart: Date,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.collaborativeEvent.update({
        where: { id: collabEventId },
        data: { status: 'CONFIRMED', confirmedSlot: confirmedStart },
      }),
      prisma.collabSlotOption.update({
        where: { id: slotId },
        data: { isConfirmed: true },
      }),
    ]);
  }

  // ─── Votación ──────────────────────────────────────────────────────────────

  /**
   * Registra el voto de un participante e incrementa el contador del slot elegido.
   */
  async registerVote(participantId: string, slotId: string): Promise<void> {
    await prisma.$transaction([
      prisma.collabParticipant.update({
        where: { id: participantId },
        data: { status: 'VOTED', votedSlotId: slotId },
      }),
      prisma.collabSlotOption.update({
        where: { id: slotId },
        data: { votes: { increment: 1 } },
      }),
    ]);
  }

  // ─── Participación individual ──────────────────────────────────────────────

  /**
   * Actualiza el estado de un participante (ACCEPTED, DECLINED, LEFT, PENDING).
   * Si se pasa localEventId, lo persiste también.
   */
  async updateParticipantStatus(
    participantId: string,
    status: ParticipantStatus,
    localEventId?: string,
  ): Promise<void> {
    await prisma.collabParticipant.update({
      where: { id: participantId },
      data: { status, ...(localEventId ? { localEventId } : {}) },
    });
  }

  /**
   * Obtiene un participante por collabEventId y userId. Retorna null si no existe.
   */
  async findParticipant(
    collabEventId: string,
    userId: string,
  ): Promise<CollabParticipant | null> {
    return prisma.collabParticipant.findFirst({
      where: { collabEventId, userId },
    });
  }

  // ─── Bloques fantasma ──────────────────────────────────────────────────────

  /**
   * Obtiene todos los bloques fantasma activos de un usuario.
   * Usado por el PayloadBuilder para bloquear capacidad en el solver.
   */
  async findActivePhantomBlocks(userId: string): Promise<PhantomBlock[]> {
    return prisma.phantomBlock.findMany({
      where: { userId, isActive: true },
    });
  }

  /**
   * Desactiva los bloques fantasma de un evento colaborativo para un usuario específico.
   */
  async deactivatePhantomBlocks(collabEventId: string, userId: string): Promise<void> {
    await prisma.phantomBlock.updateMany({
      where: { collabEventId, userId, isActive: true },
      data: { isActive: false },
    });
  }

  /**
   * Desactiva TODOS los bloques fantasma de un evento colaborativo (todos los usuarios).
   * Se usa al cancelar el evento.
   */
  async deactivateAllPhantomBlocks(collabEventId: string): Promise<void> {
    await prisma.phantomBlock.updateMany({
      where: { collabEventId, isActive: true },
      data: { isActive: false },
    });
  }

  /**
   * Crea bloques fantasma en la agenda de un usuario para los slots propuestos.
   * Se usa al crear una solicitud de reagendamiento.
   */
  async createPhantomBlocksForUser(
    userId: string,
    collabEventId: string,
    slots: Array<{ start: Date; end: Date }>,
  ): Promise<void> {
    await prisma.phantomBlock.createMany({
      data: slots.map((s) => ({
        userId,
        collabEventId,
        start: s.start,
        end: s.end,
        isActive: true,
      })),
    });
  }

  // ─── Solicitudes de reagendamiento ────────────────────────────────────────

  /**
   * Crea una solicitud de reagendamiento en estado PENDING.
   */
  async createRescheduleRequest(
    collabEventId: string,
    requestedBy: string,
  ): Promise<CollabRescheduleRequest> {
    return prisma.collabRescheduleRequest.create({
      data: { collabEventId, requestedBy, status: 'PENDING' },
    });
  }

  /**
   * Actualiza el estado de una solicitud de reagendamiento (APPROVED o REJECTED).
   */
  async updateRequestStatus(requestId: string, status: RequestStatus): Promise<void> {
    await prisma.collabRescheduleRequest.update({
      where: { id: requestId },
      data: { status },
    });
  }

  /**
   * Crea slots para una nueva ronda de votación (reagendamiento aprobado).
   */
  async createSlotsForNewRound(
    collabEventId: string,
    proposedBy: string,
    slots: Array<{ start: Date; end: Date }>,
    round: number,
  ): Promise<void> {
    await prisma.collabSlotOption.createMany({
      data: slots.map((s) => ({
        collabEventId,
        proposedBy,
        start: s.start,
        end: s.end,
        round,
        votes: 0,
        isConfirmed: false,
      })),
    });
  }

  /**
   * Resetea los votos de los participantes no-HOST a PENDING para una nueva ronda.
   */
  async resetParticipantVotes(collabEventId: string): Promise<void> {
    await prisma.collabParticipant.updateMany({
      where: { collabEventId, role: { not: 'HOST' } },
      data: { status: 'PENDING', votedSlotId: null },
    });
  }

  // ─── Queries de listado ────────────────────────────────────────────────────

  /**
   * Eventos colaborativos donde el usuario es anfitrión, ordenados por fecha DESC.
   */
  async findHostedByUser(userId: string): Promise<CollaborativeEvent[]> {
    return prisma.collaborativeEvent.findMany({
      where: { hostUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Eventos colaborativos donde el usuario es invitado (no HOST), ordenados por fecha DESC.
   */
  async findInvitedForUser(
    userId: string,
  ): Promise<Array<CollaborativeEvent & { participants: CollabParticipant[] }>> {
    return prisma.collaborativeEvent.findMany({
      where: { participants: { some: { userId, role: { not: 'HOST' } } } },
      include: { participants: { where: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const collaborativeRepository = new CollaborativeRepository();
