-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PhantomBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collabEventId" TEXT,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "reason" TEXT
);
INSERT INTO "new_PhantomBlock" ("collabEventId", "end", "id", "isActive", "start", "userId") SELECT "collabEventId", "end", "id", "isActive", "start", "userId" FROM "PhantomBlock";
DROP TABLE "PhantomBlock";
ALTER TABLE "new_PhantomBlock" RENAME TO "PhantomBlock";
CREATE INDEX "PhantomBlock_userId_isActive_idx" ON "PhantomBlock"("userId", "isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
