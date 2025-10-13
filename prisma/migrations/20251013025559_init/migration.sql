-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Calendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "etag" TEXT,
    "syncToken" TEXT,
    "lastSynced" DATETIME,
    "method" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarSource_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
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
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "icsRaw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "AvailabilitySlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Calendar_userId_idx" ON "Calendar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSource_calendarId_key" ON "CalendarSource"("calendarId");

-- CreateIndex
CREATE INDEX "Event_userId_start_idx" ON "Event"("userId", "start");

-- CreateIndex
CREATE INDEX "Event_calendarId_start_idx" ON "Event"("calendarId", "start");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_participatesInScheduling_idx" ON "Event"("participatesInScheduling");

-- CreateIndex
CREATE UNIQUE INDEX "Event_calendarId_uid_key" ON "Event"("calendarId", "uid");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_userId_dayOfWeek_idx" ON "AvailabilitySlot"("userId", "dayOfWeek");
