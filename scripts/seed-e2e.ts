/**
 * seed-e2e.ts
 * Crea escenario de prueba E2E con dos usuarios y sus eventos.
 * Idempotente: si se corre dos veces, limpia y recrea los datos de prueba.
 *
 * Uso: npx tsx scripts/seed-e2e.ts
 */

import { PrismaClient, Priority, RepeatRule, AvailabilityWindow } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();

const EMAIL_A = 'usuario-a@e2e.test';
const EMAIL_B = 'usuario-b@e2e.test';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Lunes de la PRÓXIMA semana laboral a medianoche.
 * Garantiza que los eventos siempre queden en el futuro independientemente
 * del día en que se ejecute el seed.
 */
function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Dom ... 6=Sáb
  // Días hasta el próximo lunes: Dom(0)→+1, Lun(1)→+7, Mar(2)→+6, ...
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Fecha en la próxima semana laboral.
 * @param weekday 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie
 */
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

/** Ventana RANGO que cubre la próxima semana laboral (Lun-Vie). */
function getNextWeekWindow(): { start: Date; end: Date } {
  const start = getNextMonday();
  const end = new Date(start);
  end.setDate(start.getDate() + 4); // Viernes
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getProntoWindow(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 3);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ─── Limpieza ──────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMAIL_A, EMAIL_B] } },
  });
  if (users.length === 0) return;

  const userIds = users.map((u) => u.id);

  // Eventos colaborativos donde estos usuarios son anfitriones (cascade a slots, participantes, solicitudes)
  await prisma.collaborativeEvent.deleteMany({
    where: { hostUserId: { in: userIds } },
  });

  // Participantes en eventos de otros anfitriones
  await prisma.collabParticipant.deleteMany({ where: { userId: { in: userIds } } });

  // Bloques fantasma
  await prisma.phantomBlock.deleteMany({ where: { userId: { in: userIds } } });

  // Eventos (EventICalMeta en cascade)
  await prisma.event.deleteMany({ where: { userId: { in: userIds } } });

  // Configuración
  await prisma.availabilitySlot.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userSettings.deleteMany({ where: { userId: { in: userIds } } });

  // Calendarios (CalendarSource no tiene cascade, eliminar primero)
  const calendars = await prisma.calendar.findMany({
    where: { userId: { in: userIds } },
  });
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length > 0) {
    await prisma.calendarSource.deleteMany({ where: { calendarId: { in: calendarIds } } });
    await prisma.calendar.deleteMany({ where: { id: { in: calendarIds } } });
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

// ─── Creación ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Limpiando datos de prueba anteriores...');
  await cleanup();

  const week = getNextWeekWindow();
  const pronto = getProntoWindow();

  // ── Usuario A ─────────────────────────────────────────────────────────────

  const userA = await prisma.user.create({
    data: {
      email: EMAIL_A,
      password: hashPassword('TestPassword1!'),
      name: 'Usuario A (Anfitrión)',
    },
  });

  const calendarA = await prisma.calendar.create({
    data: {
      userId: userA.id,
      name: 'Agenda de Usuario A',
      timezone: 'America/Mexico_City',
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: userA.id,
      dayStart: '09:00',
      dayEnd: '18:00',
      enabledDays: JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri']),
      eventBufferMinutes: 15,
      schedulingLeadMinutes: 10,
      timezone: 'America/Mexico_City',
      categories: JSON.stringify(['Trabajo', 'Escuela', 'Personal']),
    },
  });

  // Slots de disponibilidad L-V 09:00-18:00
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5].map((dow) => ({
      userId: userA.id,
      dayOfWeek: dow,
      startTime: '09:00',
      endTime: '18:00',
    })),
  });

  const juntaStart = dayNextWeek(1, 9, 0); // Próximo Lunes 09:00
  await prisma.event.createMany({
    data: [
      // 1. Junta semanal — CRITICA, Lunes 09:00-10:00, semanal
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Junta semanal',
        priority: Priority.CRITICA,
        start: juntaStart,
        end: addMin(juntaStart, 60),
        durationMinutes: 60,
        repeat: RepeatRule.WEEKLY,
        isFixed: true,
        participatesInScheduling: true,
        category: 'Trabajo',
        status: 'SCHEDULED',
      },
      // 2. Revisión de proyecto — URGENTE, ventana RANGO próximos 2 días laborales (antes que RELEVANTE)
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Revisión de proyecto',
        priority: Priority.URGENTE,
        durationMinutes: 60,
        window: AvailabilityWindow.RANGO,
        windowStart: week.start,
        windowEnd: (() => {
          // Ventana de 2 días desde el lunes próximo: garantiza que quede antes que RELEVANTE
          const end = new Date(week.start);
          end.setDate(end.getDate() + 1); // Lun-Mar
          end.setHours(23, 59, 59, 999);
          return end;
        })(),
        participatesInScheduling: true,
        category: 'Trabajo',
        status: 'UNSCHEDULED',
      },
      // 3. Estudiar para examen — RELEVANTE, ventana semana (RANGO próxima semana), 90 min, Escuela
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Estudiar para examen',
        priority: Priority.RELEVANTE,
        durationMinutes: 90,
        window: AvailabilityWindow.RANGO,
        windowStart: week.start,
        windowEnd: week.end,
        participatesInScheduling: true,
        category: 'Escuela',
        status: 'UNSCHEDULED',
      },
      // 4. Llamar al dentista — RELEVANTE, ventana pronto, 15 min, Personal
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Llamar al dentista',
        priority: Priority.RELEVANTE,
        durationMinutes: 15,
        window: AvailabilityWindow.PRONTO,
        windowStart: pronto.start,
        windowEnd: pronto.end,
        participatesInScheduling: true,
        category: 'Personal',
        status: 'UNSCHEDULED',
      },
      // 5. Leer artículo — OPCIONAL (fuera del calendario)
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Leer artículo',
        priority: Priority.OPCIONAL,
        durationMinutes: 30,
        participatesInScheduling: false,
        status: 'UNSCHEDULED',
      },
      // 6. Cumpleaños mamá — RECORDATORIO, todo el día, próximo miércoles
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Cumpleaños mamá',
        priority: Priority.RECORDATORIO,
        isAllDay: true,
        start: dayNextWeek(3, 0, 0), // Próximo Miércoles 00:00
        end: dayNextWeek(3, 23, 59),
        canOverlap: true,
        participatesInScheduling: false,
        status: 'SCHEDULED',
      },
      // 7. Tomar vitaminas — RECORDATORIO, solo hora inicio 08:00, diario
      {
        userId: userA.id,
        calendarId: calendarA.id,
        title: 'Tomar vitaminas',
        priority: Priority.RECORDATORIO,
        start: (() => {
          const d = new Date();
          d.setHours(8, 0, 0, 0);
          return d;
        })(),
        end: (() => {
          const d = new Date();
          d.setHours(8, 0, 0, 0);
          return d;
        })(),
        durationMinutes: 0,
        repeat: RepeatRule.DAILY,
        canOverlap: true,
        participatesInScheduling: false,
        status: 'SCHEDULED',
      },
    ],
  });

  // ── Usuario B ─────────────────────────────────────────────────────────────

  const userB = await prisma.user.create({
    data: {
      email: EMAIL_B,
      password: hashPassword('TestPassword1!'),
      name: 'Usuario B (Invitado)',
    },
  });

  const calendarB = await prisma.calendar.create({
    data: {
      userId: userB.id,
      name: 'Agenda de Usuario B',
      timezone: 'America/New_York',
    },
  });

  await prisma.userSettings.create({
    data: {
      userId: userB.id,
      dayStart: '08:00',
      dayEnd: '17:00',
      enabledDays: JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri']),
      eventBufferMinutes: 10,
      schedulingLeadMinutes: 0,
      timezone: 'America/New_York',
      categories: JSON.stringify(['Escuela', 'Trabajo', 'Salud']),
    },
  });

  // Slots de disponibilidad L-V 08:00-17:00
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5].map((dow) => ({
      userId: userB.id,
      dayOfWeek: dow,
      startTime: '08:00',
      endTime: '17:00',
    })),
  });

  const claseMartes = dayNextWeek(2, 10, 0); // Próximo Martes 10:00
  const claseJueves = dayNextWeek(4, 10, 0); // Próximo Jueves 10:00
  await prisma.event.createMany({
    data: [
      // 1a. Clase de inglés — CRITICA, Martes 10:00-11:30
      {
        userId: userB.id,
        calendarId: calendarB.id,
        title: 'Clase de inglés (Martes)',
        priority: Priority.CRITICA,
        start: claseMartes,
        end: addMin(claseMartes, 90),
        durationMinutes: 90,
        isFixed: true,
        participatesInScheduling: true,
        category: 'Escuela',
        status: 'SCHEDULED',
      },
      // 1b. Clase de inglés — CRITICA, Jueves 10:00-11:30
      {
        userId: userB.id,
        calendarId: calendarB.id,
        title: 'Clase de inglés (Jueves)',
        priority: Priority.CRITICA,
        start: claseJueves,
        end: addMin(claseJueves, 90),
        durationMinutes: 90,
        isFixed: true,
        participatesInScheduling: true,
        category: 'Escuela',
        status: 'SCHEDULED',
      },
      // 2. Entregar tarea — URGENTE, ventana pronto, 45 min, Escuela
      {
        userId: userB.id,
        calendarId: calendarB.id,
        title: 'Entregar tarea',
        priority: Priority.URGENTE,
        durationMinutes: 45,
        window: AvailabilityWindow.PRONTO,
        windowStart: pronto.start,
        windowEnd: pronto.end,
        participatesInScheduling: true,
        category: 'Escuela',
        status: 'UNSCHEDULED',
      },
      // 3. Ejercicio — RELEVANTE, ventana semana (RANGO próxima semana), 60 min, Salud
      {
        userId: userB.id,
        calendarId: calendarB.id,
        title: 'Ejercicio',
        priority: Priority.RELEVANTE,
        durationMinutes: 60,
        window: AvailabilityWindow.RANGO,
        windowStart: week.start,
        windowEnd: week.end,
        participatesInScheduling: true,
        category: 'Salud',
        status: 'UNSCHEDULED',
      },
    ],
  });

  console.log(`Seed E2E completado. Usuario A: ${userA.id}, Usuario B: ${userB.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
