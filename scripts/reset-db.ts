/**
 * reset-db.ts
 * Borra todos los datos de la base de datos manteniendo la estructura.
 * Útil para limpiar el entorno antes de correr seeds de prueba.
 *
 * Uso: npm run db:reset
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Limpiando base de datos...\n');

  // 1. CalendarSource (FK → Calendar)
  const deletedSources = await prisma.calendarSource.deleteMany();
  console.log(`  ✓ CalendarSources eliminados: ${deletedSources.count}`);

  // 2. Eventos instancia primero (self-referential: originEventId != null)
  const deletedInstances = await prisma.event.deleteMany({
    where: { originEventId: { not: null } },
  });
  console.log(`  ✓ Instancias de eventos eliminadas: ${deletedInstances.count}`);

  // 3. Resto de eventos (maestros y simples)
  const deletedEvents = await prisma.event.deleteMany();
  console.log(`  ✓ Eventos eliminados: ${deletedEvents.count}`);

  // 4. Calendars (FK → User)
  const deletedCalendars = await prisma.calendar.deleteMany();
  console.log(`  ✓ Calendarios eliminados: ${deletedCalendars.count}`);

  // 5. AvailabilitySlots (FK → User)
  const deletedSlots = await prisma.availabilitySlot.deleteMany();
  console.log(`  ✓ Slots de disponibilidad eliminados: ${deletedSlots.count}`);

  // 6. UserSettings (FK → User)
  const deletedSettings = await prisma.userSettings.deleteMany();
  console.log(`  ✓ Configuraciones de usuario eliminadas: ${deletedSettings.count}`);

  // 7. Users (último, referenciado por todo lo anterior)
  const deletedUsers = await prisma.user.deleteMany();
  console.log(`  ✓ Usuarios eliminados: ${deletedUsers.count}`);

  console.log('\n✅ Base de datos limpia y lista para seeds.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error al limpiar la base de datos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
