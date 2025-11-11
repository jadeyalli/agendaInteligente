-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayStart" TEXT NOT NULL DEFAULT '09:00',
    "dayEnd" TEXT NOT NULL DEFAULT '18:00',
    "enabledDays" TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
    "eventBufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "schedulingLeadMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
