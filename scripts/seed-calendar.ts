/**
 * seed-calendar.ts
 * Llena el calendario con datos de prueba ricos y variados para todas las vistas.
 * Crea un usuario de prueba con eventos de todas las prioridades, categorías y tipos.
 *
 * Uso: npm run db:seed-calendar
 *
 * Usuario:
 *   Email:    SEED_EMAIL    (env var, default: demo@agenda.com)
 *   Password: SEED_PASSWORD (env var, default: Demo1234!)
 */

import { PrismaClient, Priority, EventKind, RepeatRule, AvailabilityWindow } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Fecha relativa a hoy con hora específica */
function dt(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addMin(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  console.log('🌱 Iniciando seed-calendar...\n');

  const email = process.env.SEED_EMAIL ?? 'demo@agenda.com';
  const rawPassword = process.env.SEED_PASSWORD ?? 'Demo1234!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`⚠️  Usuario "${email}" ya existe. Agrega --reset para empezar limpio.\n`);
  }

  const user = existing ?? (await prisma.user.create({
    data: {
      email,
      password: hashPassword(rawPassword),
      name: 'Jadey Demo',
    },
  }));
  console.log(`👤 Usuario: ${user.email} (id: ${user.id})`);

  // UserSettings con categorías
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { categories: JSON.stringify(['Escuela', 'Trabajo', 'Personal', 'Salud', 'Familia']) },
    create: {
      userId: user.id,
      dayStart: '08:00',
      dayEnd: '20:00',
      enabledDays: JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
      timezone: 'America/Mexico_City',
      eventBufferMinutes: 10,
      schedulingLeadMinutes: 30,
      weightStability: 2,
      weightUrgency: 3,
      weightWorkHours: 2,
      weightCrossDay: 2,
      categories: JSON.stringify(['Escuela', 'Trabajo', 'Personal', 'Salud', 'Familia']),
    },
  });

  const calendar = await prisma.calendar.upsert({
    where: { id: 'seed-calendar-demo' },
    update: {},
    create: {
      id: 'seed-calendar-demo',
      userId: user.id,
      name: 'Agenda Inteligente Demo',
      color: '#6366f1',
      timezone: 'America/Mexico_City',
    },
  });
  console.log(`📅 Calendario: "${calendar.name}"\n`);

  type EventData = Parameters<typeof prisma.event.create>[0]['data'];

  const events: EventData[] = [
    // ═══════════════════════════════════════════
    // CRÍTICA — eventos fijos esta semana
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Examen parcial de Cálculo',
      description: 'Examen escrito. Llevar calculadora científica y lápiz.',
      priority: Priority.CRITICA,
      category: 'Escuela',
      start: dt(1, 9, 0),
      end: dt(1, 11, 0),
      durationMinutes: 120,
      isFixed: true,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Reunión con director de tesis',
      description: 'Revisión de avances del capítulo 3. Enviar resumen previo.',
      priority: Priority.CRITICA,
      category: 'Escuela',
      start: dt(2, 15, 0),
      end: dt(2, 16, 0),
      durationMinutes: 60,
      isFixed: true,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Entrega de proyecto final — Programación',
      description: 'Subir repositorio a GitHub Classroom antes de las 23:59.',
      priority: Priority.CRITICA,
      category: 'Escuela',
      start: dt(4, 23, 0),
      end: dt(4, 23, 59),
      durationMinutes: 59,
      isFixed: true,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Cita con el médico',
      description: 'Revisión anual. Centro de salud San Rafael.',
      priority: Priority.CRITICA,
      category: 'Salud',
      start: dt(3, 10, 30),
      end: dt(3, 11, 30),
      durationMinutes: 60,
      isFixed: true,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Presentación ejecutiva — Q1',
      description: 'Resultados del primer trimestre ante la directiva.',
      priority: Priority.CRITICA,
      category: 'Trabajo',
      start: dt(5, 10, 0),
      end: dt(5, 12, 0),
      durationMinutes: 120,
      isFixed: true,
      isInPerson: true,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },

    // ═══════════════════════════════════════════
    // URGENTE — flexibles, próximos días
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Estudiar para examen de Cálculo',
      description: 'Repasar derivadas, integrales y series. Usar Apuntes semana 7-9.',
      priority: Priority.URGENTE,
      category: 'Escuela',
      durationMinutes: 180,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Preparar reporte semanal',
      description: 'Incluir métricas de sprint, bloqueantes y próximas metas.',
      priority: Priority.URGENTE,
      category: 'Trabajo',
      durationMinutes: 90,
      dueDate: dt(1, 18, 0),
      todoStatus: 'NEEDS_ACTION',
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Revisar PR crítico en producción',
      description: 'Pull request #347 tiene conflictos de merge que bloquean al equipo.',
      priority: Priority.URGENTE,
      category: 'Trabajo',
      durationMinutes: 60,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Hacer tarea de Estadística',
      description: 'Ejercicios 4.1 al 4.15 del libro. Entregar en PDF.',
      priority: Priority.URGENTE,
      category: 'Escuela',
      durationMinutes: 120,
      dueDate: dt(2, 23, 59),
      todoStatus: 'IN_PROCESS',
      percentComplete: 20,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.PRONTO,
      status: 'SCHEDULED',
    },

    // ═══════════════════════════════════════════
    // RELEVANTE — esta semana / mes
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Sesión de mentoría con Carlos',
      description: 'Revisión de carrera y objetivos del siguiente semestre.',
      priority: Priority.RELEVANTE,
      category: 'Personal',
      durationMinutes: 60,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Actualizar CV y portafolio',
      description: 'Agregar proyectos recientes y actualizar descripción de habilidades.',
      priority: Priority.RELEVANTE,
      category: 'Personal',
      durationMinutes: 90,
      dueDate: dt(7, 18, 0),
      todoStatus: 'IN_PROCESS',
      percentComplete: 40,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Leer capítulos 5 y 6 — Diseño de Software',
      description: 'Preparación para debate del martes siguiente.',
      priority: Priority.RELEVANTE,
      category: 'Escuela',
      durationMinutes: 150,
      dueDate: dt(6, 20, 0),
      todoStatus: 'NEEDS_ACTION',
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Entrenamiento en el gimnasio',
      description: 'Rutina de fuerza — pierna y core. 45 min cardio.',
      priority: Priority.RELEVANTE,
      category: 'Salud',
      durationMinutes: 90,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Reunión familiar — cena',
      description: 'Celebración cumpleaños de mamá.',
      priority: Priority.RELEVANTE,
      category: 'Familia',
      durationMinutes: 120,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.SEMANA,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Investigación para ensayo de Ética',
      description: 'Buscar 5 fuentes académicas sobre IA y privacidad.',
      priority: Priority.RELEVANTE,
      category: 'Escuela',
      durationMinutes: 120,
      dueDate: dt(10, 20, 0),
      todoStatus: 'NEEDS_ACTION',
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.MES,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Workshop de React — Avanzado',
      description: 'Taller en línea sobre patrones avanzados, Suspense y Server Components.',
      priority: Priority.RELEVANTE,
      category: 'Trabajo',
      start: dt(8, 9, 0),
      end: addMin(dt(8, 9, 0), 240),
      durationMinutes: 240,
      isFixed: false,
      isInPerson: false,
      canOverlap: false,
      participatesInScheduling: true,
      window: AvailabilityWindow.RANGO,
      windowStart: dt(7, 8, 0),
      windowEnd: dt(14, 20, 0),
      status: 'SCHEDULED',
    },

    // ═══════════════════════════════════════════
    // Standup diario — recurrente URGENTE
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Standup del equipo',
      description: 'Sincronización diaria de 15 minutos.',
      priority: Priority.URGENTE,
      category: 'Trabajo',
      start: dt(1, 9, 0),
      end: dt(1, 9, 15),
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

    // ═══════════════════════════════════════════
    // OPCIONAL — lista de espera
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Explorar curso de Machine Learning',
      description: 'Revisar temario del curso en Coursera y ver si aplica para la tesis.',
      priority: Priority.OPCIONAL,
      category: 'Escuela',
      durationMinutes: 45,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Organizar escritorio y archivos del semestre',
      description: 'Mover PDFs, apuntes y código a carpetas organizadas.',
      priority: Priority.OPCIONAL,
      category: 'Personal',
      durationMinutes: 60,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Leer "Clean Code" — capítulos 7-10',
      description: 'Continuar lectura pendiente del libro de Robert C. Martin.',
      priority: Priority.OPCIONAL,
      category: 'Trabajo',
      durationMinutes: 90,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.EVENTO,
      title: 'Ir al cine con amigos',
      description: 'Ver la nueva película de ciencia ficción.',
      priority: Priority.OPCIONAL,
      category: 'Personal',
      durationMinutes: 150,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.TAREA,
      title: 'Preparar rutina de meditación',
      description: 'Investigar apps y establecer rutina de 10 min diarios.',
      priority: Priority.OPCIONAL,
      category: 'Salud',
      durationMinutes: 30,
      isFixed: false,
      canOverlap: false,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'WAITLIST',
    },

    // ═══════════════════════════════════════════
    // RECORDATORIOS — transparentes, no bloquean
    // ═══════════════════════════════════════════
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Tomar vitaminas',
      description: 'Vitamina D + Omega 3',
      priority: Priority.RECORDATORIO,
      category: 'Salud',
      start: dt(0, 8, 0),
      end: dt(0, 8, 5),
      durationMinutes: 5,
      isFixed: false,
      canOverlap: true,
      participatesInScheduling: false,
      repeat: RepeatRule.DAILY,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Revisar correos importantes',
      description: 'Correos de profesores y trabajo antes de comenzar el día.',
      priority: Priority.RECORDATORIO,
      category: 'Trabajo',
      start: dt(1, 8, 30),
      end: dt(1, 8, 45),
      durationMinutes: 15,
      isFixed: false,
      canOverlap: true,
      participatesInScheduling: false,
      repeat: RepeatRule.DAILY,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Llamar a papá',
      description: 'Revisar cómo están en casa.',
      priority: Priority.RECORDATORIO,
      category: 'Familia',
      start: dt(2, 19, 0),
      end: dt(2, 19, 30),
      durationMinutes: 30,
      isFixed: false,
      canOverlap: true,
      participatesInScheduling: false,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
    {
      userId: user.id,
      calendarId: calendar.id,
      kind: EventKind.RECORDATORIO,
      title: 'Hidratarse — beber agua',
      description: 'Al menos 8 vasos de agua durante el día.',
      priority: Priority.RECORDATORIO,
      category: 'Salud',
      start: dt(0, 10, 0),
      end: dt(0, 10, 5),
      durationMinutes: 5,
      isFixed: false,
      canOverlap: true,
      participatesInScheduling: false,
      repeat: RepeatRule.DAILY,
      window: AvailabilityWindow.NONE,
      status: 'SCHEDULED',
    },
  ];

  console.log('📌 Creando eventos...\n');

  let created = 0;
  for (const data of events) {
    const event = await prisma.event.create({ data: data as EventData });
    const icons: Record<string, string> = {
      CRITICA: '🔴', URGENTE: '🟠', RELEVANTE: '🔵', OPCIONAL: '🟢', RECORDATORIO: '🔔',
    };
    console.log(`  ${icons[event.priority] ?? '⚪'} [${event.priority.padEnd(11)}] [${(event.category ?? 'Sin categoría').padEnd(10)}] ${event.title}`);
    created++;
  }

  console.log(`\n✅ ${created} eventos creados exitosamente.`);
  console.log('\n🔑 Credenciales:');
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${rawPassword}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
