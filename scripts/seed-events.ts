/**
 * seed-events.ts
 * Crea un usuario de prueba, un calendario y eventos de todas las prioridades.
 * Incluye eventos fijos, flexibles, tareas y recurrentes.
 *
 * Uso: npm run db:seed-events
 *
 * Usuario creado:
 *   Email:    SEED_EMAIL    (env var, default: test@agenda.com)
 *   Password: SEED_PASSWORD (env var, default: generada y mostrada en consola)
 */

import { PrismaClient, Priority, EventKind, RepeatRule, AvailabilityWindow } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Devuelve una fecha con hora específica relativa a hoy. */
function today(hour: number, minute = 0, offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Iniciando seed de eventos de prueba...\n');

  // ── Usuario ──────────────────────────────────────────────────────────────
  const email = process.env.SEED_EMAIL ?? 'test@agenda.com';
  const rawPassword = process.env.SEED_PASSWORD;
  const password = rawPassword ?? randomBytes(10).toString('hex');
  if (!rawPassword) {
    console.log(`ℹ️  SEED_PASSWORD no definida. Contraseña generada: ${password}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`⚠️  Ya existe el usuario "${email}". Ejecuta db:reset primero si quieres empezar limpio.\n`);
  }

  const user = existing ?? (await prisma.user.create({
    data: {
      email,
      password: hashPassword(password),
      name: 'Usuario de Prueba',
    },
  }));
  console.log(`👤 Usuario: ${user.email} (id: ${user.id})`);

  // ── Configuración de usuario ─────────────────────────────────────────────
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      dayStart: '09:00',
      dayEnd: '18:00',
      enabledDays: JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri']),
      timezone: 'America/Mexico_City',
      eventBufferMinutes: 15,
      weightStability: 2,
      weightUrgency: 3,
      weightWorkHours: 2,
      weightCrossDay: 2,
    },
  });
  console.log('⚙️  Configuración de usuario creada.\n');

  // ── Calendario ───────────────────────────────────────────────────────────
  const calendar = await prisma.calendar.create({
    data: {
      userId: user.id,
      name: 'Agenda Principal',
      color: '#4F46E5',
      timezone: 'America/Mexico_City',
    },
  });
  console.log(`📅 Calendario: "${calendar.name}" (id: ${calendar.id})\n`);

  // ── Eventos ───────────────────────────────────────────────────────────────
  const events: Parameters<typeof prisma.event.create>[0]['data'][] = [

    // ── CRÍTICA (fijo, bloquea agenda) ─────────────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Reunión con cliente — CRÍTICA',
      description: 'Presentación de avances al cliente principal. No se puede mover.',
      priority: Priority.CRITICA,
      start: today(10, 0, 1),          // mañana 10:00
      end: today(11, 0, 1),            // mañana 11:00
      durationMinutes: 60,
      isFixed: true,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
      location: 'Sala de conferencias A',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Entrega al cliente final — CRÍTICA',
      description: 'Fecha límite inamovible para la entrega del sprint.',
      priority: Priority.CRITICA,
      start: today(17, 0, 3),          // en 3 días 17:00
      end: today(18, 0, 3),
      durationMinutes: 60,
      isFixed: true,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ── URGENTE (flexible, ventana PRONTO ~48h) ────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Revisar pull request — URGENTE',
      description: 'El equipo está bloqueado esperando la revisión.',
      priority: Priority.URGENTE,
      start: today(14, 0),             // hoy 14:00 (sugerido, puede moverse)
      end: today(15, 30),
      durationMinutes: 90,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Corregir bug en producción — URGENTE',
      description: 'Error crítico reportado por usuarios. Estimado: 2 horas.',
      priority: Priority.URGENTE,
      durationMinutes: 120,
      dueDate: today(23, 59, 1),       // vence mañana al final del día
      todoStatus: 'NEEDS_ACTION',
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },

    // ── RELEVANTE (flexible, ventana SEMANA / MES) ─────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Preparar presentación técnica — RELEVANTE',
      description: 'Slides para la demo interna del viernes.',
      priority: Priority.RELEVANTE,
      durationMinutes: 180,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Documentar API REST — RELEVANTE',
      description: 'Actualizar Swagger con los nuevos endpoints.',
      priority: Priority.RELEVANTE,
      durationMinutes: 120,
      dueDate: today(18, 0, 7),        // en una semana
      todoStatus: 'IN_PROCESS',
      percentComplete: 30,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.MES,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Sesión de refactoring — RELEVANTE',
      description: 'Limpiar deuda técnica acumulada en el módulo de pagos.',
      priority: Priority.RELEVANTE,
      durationMinutes: 150,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.MES,
      status: 'SCHEDULED',
    },

    // ── OPCIONAL (sin ventana, en lista de espera) ─────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Leer artículo sobre arquitectura hexagonal — OPCIONAL',
      description: 'Guardado para cuando haya tiempo libre.',
      priority: Priority.OPCIONAL,
      durationMinutes: 45,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Organizar carpetas del proyecto — OPCIONAL',
      description: 'Limpieza de archivos obsoletos.',
      priority: Priority.OPCIONAL,
      durationMinutes: 60,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },

    // ── Recurrente semanal (URGENTE) ───────────────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Standup del equipo — URGENTE (recurrente)',
      description: 'Sincronización diaria de 15 minutos.',
      priority: Priority.URGENTE,
      start: today(9, 0, 1),           // mañana 09:00, primer ocurrencia
      end: today(9, 15, 1),
      durationMinutes: 15,
      isFixed: true,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      repeat: RepeatRule.WEEKLY,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ── Evento con ventana RANGO personalizada ─────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Taller de TypeScript avanzado — RELEVANTE',
      description: 'Solo disponible dentro de la ventana de la próxima quincena.',
      priority: Priority.RELEVANTE,
      // start/end dan posición inicial sugerida; el scheduler puede moverlo
      // dentro de la ventana RANGO (windowStart→windowEnd)
      start: today(9, 0, 5),
      end: addMinutes(today(9, 0, 5), 240),
      durationMinutes: 240,
      isFixed: false,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.RANGO,
      windowStart: today(9, 0, 5),     // desde en 5 días
      windowEnd: today(18, 0, 14),     // hasta en 14 días
      status: 'SCHEDULED',
      location: 'Sala de capacitación',
    },
  ];

  console.log('📌 Creando eventos...\n');

  for (const data of events) {
    const event = await prisma.event.create({ data: data as Parameters<typeof prisma.event.create>[0]['data'] });
    const icon = iconFor(event.priority);
    console.log(`  ${icon} [${event.priority}] ${event.title}`);
  }

  console.log(`\n✅ ${events.length} eventos creados exitosamente.`);
  console.log('\n🔑 Credenciales del usuario de prueba:');
  console.log('   Email:    test@agenda.com');
  console.log('   Password: Test1234!\n');
}

function iconFor(priority: Priority): string {
  const icons: Record<Priority, string> = {
    CRITICA: '🔴',
    URGENTE: '🟠',
    RELEVANTE: '🟡',
    OPCIONAL: '🟢',
    RECORDATORIO: '🔔',
  };
  return icons[priority] ?? '⚪';
}

main()
  .catch((e) => {
    console.error('❌ Error al ejecutar el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
