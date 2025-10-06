-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EVENTO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start" DATETIME,
    "end" DATETIME,
    "durationMinutes" INTEGER,
    "priority" TEXT NOT NULL,
    "category" TEXT,
    "isInPerson" BOOLEAN NOT NULL DEFAULT true,
    "canOverlap" BOOLEAN NOT NULL DEFAULT false,
    "repeat" TEXT NOT NULL DEFAULT 'NONE',
    "window" TEXT NOT NULL DEFAULT 'NONE',
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "shareLink" TEXT,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("createdAt", "description", "durationMinutes", "end", "id", "isFixed", "priority", "start", "status", "title", "updatedAt", "userId") SELECT "createdAt", "description", "durationMinutes", "end", "id", "isFixed", "priority", "start", "status", "title", "updatedAt", "userId" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_userId_start_idx" ON "Event"("userId", "start");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
