-- Phase 3: Separar EventICalMeta, relación User-Calendar 1:1, modelos colaborativos

-- DropIndex (se reemplaza por UNIQUE key)
DROP INDEX "Calendar_userId_idx";

-- CreateTable EventICalMeta
CREATE TABLE "EventICalMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "calendarId" TEXT,
    "uid" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "etag" TEXT,
    "lastModified" DATETIME,
    "createdIcal" DATETIME,
    "location" TEXT,
    "statusIcal" TEXT,
    "transparency" TEXT,
    "organizer" TEXT,
    "attendees" JSONB,
    "icsRaw" TEXT,
    CONSTRAINT "EventICalMeta_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable CollaborativeEvent
CREATE TABLE "CollaborativeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "confirmedSlot" DATETIME,
    "hostTimezone" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable CollabSlotOption
CREATE TABLE "CollabSlotOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collabEventId" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "phantomBlockId" TEXT,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "round" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CollabSlotOption_collabEventId_fkey" FOREIGN KEY ("collabEventId") REFERENCES "CollaborativeEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable CollabParticipant
CREATE TABLE "CollabParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collabEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "votedSlotId" TEXT,
    "localEventId" TEXT,
    "timezone" TEXT NOT NULL,
    CONSTRAINT "CollabParticipant_collabEventId_fkey" FOREIGN KEY ("collabEventId") REFERENCES "CollaborativeEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable CollabRescheduleRequest
CREATE TABLE "CollabRescheduleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collabEventId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollabRescheduleRequest_collabEventId_fkey" FOREIGN KEY ("collabEventId") REFERENCES "CollaborativeEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable PhantomBlock
CREATE TABLE "PhantomBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collabEventId" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- RedefineTables: Event (eliminar campos iCal, mantener núcleo)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT,
    "originEventId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'EVENTO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start" DATETIME,
    "end" DATETIME,
    "tzid" TEXT,
    "durationMinutes" INTEGER,
    "dueDate" DATETIME,
    "todoStatus" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "percentComplete" INTEGER,
    "priority" TEXT NOT NULL,
    "category" TEXT,
    "isInPerson" BOOLEAN NOT NULL DEFAULT true,
    "canOverlap" BOOLEAN NOT NULL DEFAULT false,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "participatesInScheduling" BOOLEAN NOT NULL DEFAULT true,
    "repeat" TEXT NOT NULL DEFAULT 'NONE',
    "rrule" TEXT,
    "rdate" JSONB,
    "exrule" TEXT,
    "exdate" JSONB,
    "window" TEXT NOT NULL DEFAULT 'NONE',
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("calendarId", "canOverlap", "category", "completed", "completedAt", "createdAt", "description", "dueDate", "durationMinutes", "end", "exdate", "exrule", "id", "isAllDay", "isFixed", "isInPerson", "kind", "originEventId", "participatesInScheduling", "percentComplete", "priority", "rdate", "repeat", "rrule", "start", "status", "title", "todoStatus", "tzid", "updatedAt", "userId", "window", "windowEnd", "windowStart") SELECT "calendarId", "canOverlap", "category", "completed", "completedAt", "createdAt", "description", "dueDate", "durationMinutes", "end", "exdate", "exrule", "id", "isAllDay", "isFixed", "isInPerson", "kind", "originEventId", "participatesInScheduling", "percentComplete", "priority", "rdate", "repeat", "rrule", "start", "status", "title", "todoStatus", "tzid", "updatedAt", "userId", "window", "windowEnd", "windowStart" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_userId_idx" ON "Event"("userId");
CREATE INDEX "Event_userId_start_idx" ON "Event"("userId", "start");
CREATE INDEX "Event_calendarId_start_idx" ON "Event"("calendarId", "start");
CREATE INDEX "Event_status_idx" ON "Event"("status");
CREATE INDEX "Event_participatesInScheduling_idx" ON "Event"("participatesInScheduling");

-- RedefineTables: UserSettings (agregar categories con default)
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayStart" TEXT NOT NULL DEFAULT '09:00',
    "dayEnd" TEXT NOT NULL DEFAULT '18:00',
    "enabledDays" TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
    "eventBufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "schedulingLeadMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "weightStability" INTEGER NOT NULL DEFAULT 2,
    "weightUrgency" INTEGER NOT NULL DEFAULT 2,
    "weightWorkHours" INTEGER NOT NULL DEFAULT 2,
    "weightCrossDay" INTEGER NOT NULL DEFAULT 2,
    "categories" TEXT NOT NULL DEFAULT '["Escuela","Trabajo","Personal","Familia","Salud"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("createdAt", "dayEnd", "dayStart", "enabledDays", "eventBufferMinutes", "id", "schedulingLeadMinutes", "timezone", "updatedAt", "userId", "weightCrossDay", "weightStability", "weightUrgency", "weightWorkHours") SELECT "createdAt", "dayEnd", "dayStart", "enabledDays", "eventBufferMinutes", "id", "schedulingLeadMinutes", "timezone", "updatedAt", "userId", "weightCrossDay", "weightStability", "weightUrgency", "weightWorkHours" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EventICalMeta_eventId_key" ON "EventICalMeta"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventICalMeta_calendarId_uid_key" ON "EventICalMeta"("calendarId", "uid");

-- CreateIndex
CREATE INDEX "PhantomBlock_userId_isActive_idx" ON "PhantomBlock"("userId", "isActive");

-- CreateIndex: Calendar 1:1 con User
CREATE UNIQUE INDEX "Calendar_userId_key" ON "Calendar"("userId");
