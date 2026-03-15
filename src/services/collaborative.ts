/**
 * Servicio de eventos colaborativos.
 * Único punto donde vive la lógica de negocio del ciclo colaborativo completo.
 * Los API routes solo delegan aquí.
 */
import { collaborativeRepository } from '@/repositories/collaborative.repo';
import { eventRepository } from '@/repositories/events.repo';
import { settingsRepository } from '@/repositories/settings.repo';
import { translateSlotForInvitee } from './timezone-translator';
import { SchedulingService } from './scheduling';

import type {
  CollaborativeEvent,
  CollabParticipant,
  CollabSlotOption,
  CollabRescheduleRequest,
} from '@prisma/client';
import type {
  CreateCollaborativeEventInput,
  CollaborativeInvitation,
  VotingResults,
  RescheduleRequestInput,
  CollaborativeActionResult,
  TranslatedSlot,
} from '@/domain/collaborative-types';

type EventWithRelations = CollaborativeEvent & {
  slots: CollabSlotOption[];
  participants: CollabParticipant[];
  requests: CollabRescheduleRequest[];
};

export class CollaborativeService {
  private readonly schedulingService = new SchedulingService();

  // ─── Fase 1: Creación ──────────────────────────────────────────────────────

  /**
   * Crea un evento colaborativo con 3 slots, bloques fantasma y participantes.
   *
   * Validaciones:
   * - proposedSlots debe tener exactamente 3 elementos.
   * - Cada slot debe tener duración igual a durationMin.
   * - Al menos 1 participante además del anfitrión.
   *
   * @returns ID del CollaborativeEvent creado.
   */
  async create(hostUserId: string, input: CreateCollaborativeEventInput): Promise<string> {
    if (input.proposedSlots.length !== 3) {
      throw new Error('Se requieren exactamente 3 slots propuestos.');
    }
    if (input.participants.length === 0) {
      throw new Error('Se requiere al menos 1 participante además del anfitrión.');
    }

    for (const slot of input.proposedSlots) {
      const durationMin =
        (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000;
      if (durationMin !== input.durationMin) {
        throw new Error(`Cada slot debe durar exactamente ${input.durationMin} minutos.`);
      }
    }

    const participantsWithTz = await Promise.all(
      input.participants.map(async (p) => {
        const settings = await settingsRepository.findByUserId(p.userId);
        return {
          userId: p.userId,
          role: p.role,
          timezone: settings?.timezone ?? 'America/Mexico_City',
        };
      }),
    );

    const event = await collaborativeRepository.createWithSlotsAndParticipants({
      hostUserId,
      title: input.title,
      description: input.description,
      durationMin: input.durationMin,
      hostTimezone: input.hostTimezone,
      slots: input.proposedSlots.map((s) => ({
        start: new Date(s.start),
        end: new Date(s.end),
      })),
      participants: participantsWithTz,
    });

    return event.id;
  }

  /**
   * Transiciona el evento de DRAFT a VOTING (abre la votación a los invitados).
   * Solo el anfitrión puede ejecutar esta acción.
   */
  async sendInvitations(collabEventId: string, hostUserId: string): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);
    this.assertStatus(event, 'DRAFT');
    await collaborativeRepository.updateStatus(collabEventId, 'VOTING');
  }

  // ─── Fase 2: Votación ──────────────────────────────────────────────────────

  /**
   * Devuelve la invitación con los slots de la ronda actual traducidos a la zona del invitado.
   */
  async getInvitation(collabEventId: string, userId: string): Promise<CollaborativeInvitation> {
    const event = await this.getEventOrThrow(collabEventId);
    const participant = await this.getParticipantOrThrow(collabEventId, userId);

    const currentRound = Math.max(...event.slots.map((s) => s.round), 1);
    const currentSlots = event.slots.filter((s) => s.round === currentRound);

    const translatedSlots: TranslatedSlot[] = currentSlots.map((slot) => ({
      slotId: slot.id,
      ...translateSlotForInvitee(slot.start, slot.end, event.hostTimezone, participant.timezone),
    }));

    const hostParticipant = event.participants.find((p) => p.role === 'HOST');

    return {
      collabEventId: event.id,
      title: event.title,
      description: event.description,
      durationMin: event.durationMin,
      hostName: hostParticipant?.userId ?? 'Anfitrión',
      status: event.status,
      myRole: participant.role,
      myStatus: participant.status,
      currentRound,
      slots: translatedSlots,
    };
  }

  /**
   * Registra el voto de un invitado por un slot de la ronda actual.
   *
   * Validaciones:
   * - El evento debe estar en estado VOTING o RENEGOTIATING.
   * - El usuario debe ser participante y no haber votado ya en esta ronda.
   * - El slotId debe pertenecer a la ronda actual.
   */
  async vote(collabEventId: string, userId: string, slotId: string): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    if (event.status !== 'VOTING' && event.status !== 'RENEGOTIATING') {
      throw new Error('La votación no está abierta.');
    }

    const participant = await this.getParticipantOrThrow(collabEventId, userId);
    if (participant.status === 'VOTED') {
      throw new Error('Ya votaste en esta ronda.');
    }

    const currentRound = Math.max(...event.slots.map((s) => s.round), 1);
    const slot = event.slots.find((s) => s.id === slotId && s.round === currentRound);
    if (!slot) {
      throw new Error('El slot seleccionado no pertenece a la ronda actual.');
    }

    await collaborativeRepository.registerVote(participant.id, slotId);
  }

  // ─── Fase 3: Confirmación ──────────────────────────────────────────────────

  /**
   * Devuelve los resultados de votación para el anfitrión.
   */
  async getVotingResults(collabEventId: string, hostUserId: string): Promise<VotingResults> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);

    const currentRound = Math.max(...event.slots.map((s) => s.round), 1);
    const currentSlots = event.slots.filter((s) => s.round === currentRound);
    const nonHostParticipants = event.participants.filter((p) => p.role !== 'HOST');

    return {
      collabEventId: event.id,
      title: event.title,
      status: event.status,
      currentRound,
      totalParticipants: nonHostParticipants.length,
      totalVotes: nonHostParticipants.filter((p) => p.status === 'VOTED').length,
      slots: currentSlots.map((slot) => ({
        slotId: slot.id,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        votes: slot.votes,
        voters: nonHostParticipants
          .filter((p) => p.votedSlotId === slot.id)
          .map((p) => ({ userId: p.userId, userName: null })),
      })),
    };
  }

  /**
   * El anfitrión confirma un slot. Efectos:
   * 1. Estado → CONFIRMED, slot marcado como isConfirmed.
   * 2. Bloques fantasma del anfitrión desactivados.
   * 3. Evento fijo/crítico creado en la agenda del anfitrión.
   * 4. localEventId del participante HOST actualizado.
   */
  async confirmSlot(
    collabEventId: string,
    hostUserId: string,
    slotId: string,
  ): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);
    if (event.status !== 'VOTING' && event.status !== 'RENEGOTIATING') {
      throw new Error('No hay votación activa para confirmar.');
    }

    const slot = event.slots.find((s) => s.id === slotId);
    if (!slot) throw new Error('Slot no encontrado.');

    await collaborativeRepository.confirmSlot(collabEventId, slotId, slot.start);
    await collaborativeRepository.deactivatePhantomBlocks(collabEventId, hostUserId);

    const localEvent = await eventRepository.create({
      userId: hostUserId,
      title: event.title,
      description: event.description,
      priority: 'CRITICA',
      start: slot.start,
      end: slot.end,
      isFixed: true,
      durationMinutes: event.durationMin,
    });

    const hostParticipant = event.participants.find((p) => p.role === 'HOST');
    if (hostParticipant) {
      await collaborativeRepository.updateParticipantStatus(
        hostParticipant.id,
        'ACCEPTED',
        localEvent.id,
      );
    }
  }

  // ─── Fase 4: Aceptación individual ────────────────────────────────────────

  /**
   * Invitado acepta el horario confirmado. Efectos:
   * 1. Evento fijo/crítico creado en su agenda (horario traducido a su zona).
   * 2. Estado participante → ACCEPTED.
   * 3. Solver ejecutado para reagendar su agenda.
   * 4. Resultado retornado para que el frontend muestre el modal de confirmación.
   */
  async acceptConfirmedSlot(
    collabEventId: string,
    userId: string,
  ): Promise<CollaborativeActionResult> {
    const event = await this.getEventOrThrow(collabEventId);
    if (event.status !== 'CONFIRMED') {
      throw new Error('El evento aún no ha sido confirmado.');
    }

    const participant = await this.getParticipantOrThrow(collabEventId, userId);
    if (participant.status === 'ACCEPTED') {
      throw new Error('Ya aceptaste este evento.');
    }

    const confirmedSlot = event.slots.find((s) => s.isConfirmed);
    if (!confirmedSlot) throw new Error('No hay slot confirmado.');

    const translated = translateSlotForInvitee(
      confirmedSlot.start,
      confirmedSlot.end,
      event.hostTimezone,
      participant.timezone,
    );

    const localEvent = await eventRepository.create({
      userId,
      title: event.title,
      description: event.description,
      priority: 'CRITICA',
      start: new Date(translated.startLocalTz),
      end: new Date(translated.endLocalTz),
      isFixed: true,
      durationMinutes: event.durationMin,
    });

    await collaborativeRepository.updateParticipantStatus(
      participant.id,
      'ACCEPTED',
      localEvent.id,
    );

    try {
      const solverResult = await this.schedulingService.solve(userId);
      return {
        success: true,
        message: 'Evento aceptado y agenda reagendada.',
        schedulingChanges: {
          placed: solverResult.placed,
          moved: solverResult.moved,
        },
      };
    } catch {
      return {
        success: true,
        message: 'Evento aceptado. No se pudo optimizar la agenda automáticamente.',
      };
    }
  }

  /**
   * Invitado rechaza el horario confirmado.
   * Guarda el evento como recordatorio (se solapa, no afecta agenda).
   */
  async declineConfirmedSlot(collabEventId: string, userId: string): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    if (event.status !== 'CONFIRMED') {
      throw new Error('El evento aún no ha sido confirmado.');
    }

    const participant = await this.getParticipantOrThrow(collabEventId, userId);
    const confirmedSlot = event.slots.find((s) => s.isConfirmed);
    if (!confirmedSlot) throw new Error('No hay slot confirmado.');

    const translated = translateSlotForInvitee(
      confirmedSlot.start,
      confirmedSlot.end,
      event.hostTimezone,
      participant.timezone,
    );

    const reminder = await eventRepository.create({
      userId,
      title: `[Recordatorio] ${event.title}`,
      description: event.description,
      priority: 'RECORDATORIO',
      start: new Date(translated.startLocalTz),
      end: new Date(translated.endLocalTz),
      canOverlap: true,
      durationMinutes: event.durationMin,
    });

    await collaborativeRepository.updateParticipantStatus(
      participant.id,
      'DECLINED',
      reminder.id,
    );
  }

  // ─── Fase 5: Solicitud de reagendamiento ───────────────────────────────────

  /**
   * Invitado ESSENTIAL solicita reagendar. Efectos:
   * - CollabRescheduleRequest creado en PENDING.
   * - Nuevos CollabSlotOption creados con ronda siguiente.
   * - Bloques fantasma creados en la agenda del invitado.
   *
   * @returns ID de la solicitud creada.
   */
  async requestReschedule(
    collabEventId: string,
    userId: string,
    input: RescheduleRequestInput,
  ): Promise<string> {
    const event = await this.getEventOrThrow(collabEventId);
    if (event.status !== 'CONFIRMED') {
      throw new Error('Solo se puede solicitar reagendamiento de eventos confirmados.');
    }

    const participant = await this.getParticipantOrThrow(collabEventId, userId);
    if (participant.role !== 'ESSENTIAL') {
      throw new Error('Solo invitados indispensables pueden solicitar reagendamiento.');
    }
    if (input.proposedSlots.length !== 3) {
      throw new Error('Se requieren exactamente 3 slots alternativos.');
    }

    const pendingRequest = event.requests.find((r) => r.status === 'PENDING');
    if (pendingRequest) {
      throw new Error('Ya hay una solicitud de reagendamiento pendiente.');
    }

    for (const slot of input.proposedSlots) {
      const durationMin =
        (new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000;
      if (durationMin !== event.durationMin) {
        throw new Error(`Cada slot debe durar exactamente ${event.durationMin} minutos.`);
      }
    }

    const currentRound = Math.max(...event.slots.map((s) => s.round), 1);
    const parsedSlots = input.proposedSlots.map((s) => ({
      start: new Date(s.start),
      end: new Date(s.end),
    }));

    await collaborativeRepository.createSlotsForNewRound(
      collabEventId,
      userId,
      parsedSlots,
      currentRound + 1,
    );

    const request = await collaborativeRepository.createRescheduleRequest(collabEventId, userId);

    await collaborativeRepository.createPhantomBlocksForUser(userId, collabEventId, parsedSlots);

    return request.id;
  }

  /**
   * Anfitrión aprueba la solicitud de reagendamiento. Efectos:
   * 1. Solicitud → APPROVED.
   * 2. Evento → RENEGOTIATING.
   * 3. Participantes no-HOST reseteados a PENDING.
   * 4. Evento local del anfitrión desfijado temporalmente.
   */
  async approveRescheduleRequest(
    collabEventId: string,
    hostUserId: string,
    requestId: string,
  ): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);

    const request = event.requests.find((r) => r.id === requestId);
    if (!request || request.status !== 'PENDING') {
      throw new Error('Solicitud no encontrada o ya procesada.');
    }

    await collaborativeRepository.updateRequestStatus(requestId, 'APPROVED');
    await collaborativeRepository.updateStatus(collabEventId, 'RENEGOTIATING');
    await collaborativeRepository.resetParticipantVotes(collabEventId);

    const hostParticipant = event.participants.find((p) => p.role === 'HOST');
    if (hostParticipant?.localEventId) {
      await eventRepository.updateFixed(hostParticipant.localEventId, false);
    }
  }

  /**
   * Anfitrión rechaza la solicitud de reagendamiento. Efectos:
   * 1. Solicitud → REJECTED.
   * 2. Bloques fantasma del invitado que solicitó son eliminados.
   * 3. El evento sigue CONFIRMED sin cambios.
   */
  async rejectRescheduleRequest(
    collabEventId: string,
    hostUserId: string,
    requestId: string,
  ): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);

    const request = event.requests.find((r) => r.id === requestId);
    if (!request || request.status !== 'PENDING') {
      throw new Error('Solicitud no encontrada o ya procesada.');
    }

    await collaborativeRepository.updateRequestStatus(requestId, 'REJECTED');
    await collaborativeRepository.deactivatePhantomBlocks(collabEventId, request.requestedBy);
  }

  /**
   * Invitado se sale del evento colaborativo.
   * Si tiene evento local creado, lo elimina. Elimina sus bloques fantasma.
   */
  async leaveEvent(collabEventId: string, userId: string): Promise<void> {
    const participant = await this.getParticipantOrThrow(collabEventId, userId);
    if (participant.role === 'HOST') {
      throw new Error('El anfitrión no puede salirse. Debe cancelar el evento.');
    }

    if (participant.localEventId) {
      await eventRepository.delete(participant.localEventId);
    }

    await collaborativeRepository.deactivatePhantomBlocks(collabEventId, userId);
    await collaborativeRepository.updateParticipantStatus(participant.id, 'LEFT');
  }

  /**
   * Anfitrión cancela el evento. Efectos:
   * 1. Estado → CANCELLED.
   * 2. Todos los bloques fantasma desactivados.
   * 3. Eventos locales de participantes ACCEPTED convertidos a recordatorios.
   */
  async cancelEvent(collabEventId: string, hostUserId: string): Promise<void> {
    const event = await this.getEventOrThrow(collabEventId);
    this.assertHost(event, hostUserId);

    await collaborativeRepository.updateStatus(collabEventId, 'CANCELLED');
    await collaborativeRepository.deactivateAllPhantomBlocks(collabEventId);

    for (const p of event.participants) {
      if (p.status === 'ACCEPTED' && p.localEventId) {
        await eventRepository.convertToReminder(p.localEventId);
      }
    }
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private async getEventOrThrow(collabEventId: string): Promise<EventWithRelations> {
    const event = await collaborativeRepository.findByIdWithRelations(collabEventId);
    if (!event) throw new Error('Evento colaborativo no encontrado.');
    return event;
  }

  private async getParticipantOrThrow(
    collabEventId: string,
    userId: string,
  ): Promise<CollabParticipant> {
    const participant = await collaborativeRepository.findParticipant(collabEventId, userId);
    if (!participant) throw new Error('No eres participante de este evento.');
    return participant;
  }

  private assertHost(event: { hostUserId: string }, userId: string): void {
    if (event.hostUserId !== userId) {
      throw new Error('Solo el anfitrión puede realizar esta acción.');
    }
  }

  private assertStatus(event: { status: string }, expected: string): void {
    if (event.status !== expected) {
      throw new Error(
        `El evento debe estar en estado ${expected}, pero está en ${event.status}.`,
      );
    }
  }
}

export const collaborativeService = new CollaborativeService();
