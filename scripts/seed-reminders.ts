/**
 * seed-reminders.ts
 * Crea recordatorios de prueba para el usuario test@agenda.com.
 * Los recordatorios tienen kind=RECORDATORIO y priority=RECORDATORIO.
 * No bloquean tiempo en la agenda (canOverlap=true, transparency=TRANSPARENT).
 *
 * Uso: npm run db:seed-reminders
 *
 * Requiere que el usuario test@agenda.com ya exista.
 * Si no existe, ejecuta primero: npm run db:seed-events
 */

import { PrismaClient, Priority, EventKind, RepeatRule, AvailabilityWindow, ICalTransparency } from '@prisma/client';

const prisma = new PrismaClient();

/** Fecha con hora específica relativa a hoy. */
function today(hour: number, minute = 0, offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('🔔 Iniciando seed de recordatorios...\n');

  // ── Buscar usuario de prueba ─────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: 'test@agenda.com' },
    include: { calendars: true },
  });

  if (!user) {
    console.error('❌ Usuario test@agenda.com no encontrado.');
    console.error('   Ejecuta primero: npm run db:seed-events\n');
    process.exit(1);
  }

  const calendar = user.calendars[0];
  if (!calendar) {
    console.error('❌ El usuario no tiene ningún calendario.');
    process.exit(1);
  }

  console.log(`👤 Usuario: ${user.email}`);
  console.log(`📅 Calendario: ${calendar.name}\n`);

  // ── Recordatorios ─────────────────────────────────────────────────────────
  const reminders: Parameters<typeof prisma.event.create>[0]['data'][] = [

    // ── Recordatorios puntuales (no recurrentes) ───────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Tomar vitaminas ☀️',
      description: 'Vitamina D y C con el desayuno.',
      priority: Priority.RECORDATORIO,
      start: today(8, 0),              // hoy 08:00
      end: today(8, 5),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Revisar correos del día 📬',
      description: 'Procesar inbox y responder pendientes antes de las 10am.',
      priority: Priority.RECORDATORIO,
      start: today(9, 30),             // hoy 09:30
      end: today(9, 35),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Llamar al proveedor antes del cierre 📞',
      description: 'Confirmar entrega del mes.',
      priority: Priority.RECORDATORIO,
      start: today(17, 0, 1),          // mañana 17:00
      end: today(17, 5, 1),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Pago de servicios 💳',
      description: 'Pagar internet y teléfono antes de fin de mes.',
      priority: Priority.RECORDATORIO,
      start: today(10, 0, 5),          // en 5 días
      end: today(10, 5, 5),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ── Recordatorios recurrentes (diarios) ────────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Hidratación — tomar agua 💧',
      description: 'Recordatorio cada día a mediodía.',
      priority: Priority.RECORDATORIO,
      start: today(12, 0),
      end: today(12, 5),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      repeat: RepeatRule.DAILY,
      rrule: 'FREQ=DAILY',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Pausa activa 🧘',
      description: '5 minutos de estiramiento para descansar la vista.',
      priority: Priority.RECORDATORIO,
      start: today(15, 30),
      end: today(15, 35),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      repeat: RepeatRule.DAILY,
      rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ── Recordatorio recurrente semanal ────────────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Revisión semanal de objetivos 📋',
      description: 'Revisar métricas de la semana y planear la siguiente.',
      priority: Priority.RECORDATORIO,
      start: today(9, 0, (5 - new Date().getDay() + 5) % 7 || 7), // próximo viernes
      end: today(9, 10, (5 - new Date().getDay() + 5) % 7 || 7),
      durationMinutes: 10,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      repeat: RepeatRule.WEEKLY,
      rrule: 'FREQ=WEEKLY;BYDAY=FR',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Actualizar dependencias del proyecto 🔧',
      description: 'Revisar npm outdated y actualizar paquetes seguros.',
      priority: Priority.RECORDATORIO,
      start: today(10, 0, (1 - new Date().getDay() + 7) % 7 || 7), // próximo lunes
      end: today(10, 5, (1 - new Date().getDay() + 7) % 7 || 7),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      repeat: RepeatRule.WEEKLY,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ── Recordatorio mensual ───────────────────────────────────────────────
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Backup del proyecto 💾',
      description: 'Verificar backups y hacer snapshot mensual del repositorio.',
      priority: Priority.RECORDATORIO,
      start: today(11, 0),
      end: today(11, 5),
      durationMinutes: 5,
      isFixed: false,
      isInPerson: false,
      canOverlap: true,
      participatesInScheduling: false,
      transparency: ICalTransparency.TRANSPARENT,
      repeat: RepeatRule.MONTHLY,
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
  ];

  console.log('🔔 Creando recordatorios...\n');

  for (const data of reminders) {
    const reminder = await prisma.event.create({ data: data as Parameters<typeof prisma.event.create>[0]['data'] });
    const recTag = reminder.repeat !== RepeatRule.NONE ? ` [${reminder.repeat}]` : '';
    console.log(`  🔔 ${reminder.title}${recTag}`);
  }

  console.log(`\n✅ ${reminders.length} recordatorios creados exitosamente.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error al ejecutar el seed de recordatorios:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
